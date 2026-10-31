# HANDOFF - ENG-101 Resource types, schedule and exception calendar

Status: proposed, ready for implementation.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:14 (ENG-101), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Multi-tenant venue & resource hierarchy with DAG component constraints (`ENG-003`).
- GiST exclusion constraints on `resource_claims` (`ENG-004`).

---

## Task Definition
`ENG-101 | Resource types, schedule and exception calendar | Weekly operating hours, holiday exceptions, resource types (PC, CONSOLE_SETUP, PRIVATE_ROOM) | Operating schedule boundaries, half-open intervals [start, end), DAG resource component collision blocking, holiday closure precedence | GET /v1/venues/:id/availability, GET/PUT /v1/dashboard/venues/:id/schedule, GET/POST/DELETE /v1/dashboard/venues/:id/exceptions | operating_schedules, schedule_exceptions | Venue Hours & Exceptions | SCHEDULE_INVALID_INTERVAL, SCHEDULE_EXCEPTION_NOT_FOUND, SCHEDULE_CLOSED | Public availability: unauthenticated; Venue schedule/exceptions: OWNER/VENUE_MANAGER (read/write), RECEPTION (read) | Weekly schedule bounds, exception calendar overrides, private-room component collision availability, DST/cross-midnight intervals | availability_queried, schedule_updated, exception_created | Bookings & Operations Core`

---

## 1. Domain Invariants & Rules

### 1.1 Weekly Operating Schedules
- Each venue defines operating hours for days of the week `0..6` (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
- Supports cross-midnight operating hours (e.g. open `14:00`, close `02:00` next morning).
- A day marked `is_closed = true` has zero operating slots.

### 1.2 Exception Calendar
- Specific dates (`YYYY-MM-DD`) can override the weekly schedule for holidays, emergency maintenance, or special events.
- An exception can define custom hours (`open_time`, `close_time`) or mark the venue entirely closed (`is_closed = true`).
- Exception date overrides take strict precedence over weekly recurring schedules.

### 1.3 Availability Computation Algorithm (`GET /v1/venues/:id/availability?from=&to=&resource_type=`)
- Validates query range: `from < to`, range <= 14 days, UTC ISO-8601 timestamps.
- Filters active bookable resources of the requested type (or all types if omitted).
- Excludes resources with `status IN ('MAINTENANCE', 'TEMP_BLOCKED')`.
- For each resource:
  - Generates candidate slots matching operating hours for the given venue timezone (`Europe/Bucharest`).
  - Filters out windows that fall outside the operating schedule or on closed exception dates.
  - Subtracts any overlapping active claims from `resource_claims` (`state IN ('ACTIVE_HOLD', 'CONFIRMED')`).
  - **Composite Room DAG Collision**:
    - If a resource is a `PRIVATE_ROOM`, any claim on ANY of its component children (from `resource_components`) blocks the private room for that window.
    - Conversely, if a `PRIVATE_ROOM` has an active claim, all of its component children are marked unavailable for that window.
- Returns clean, advisory availability slot intervals: `[ { resourceId, resourceName, type, availableWindows: [{ start, end }] } ]`.

---

## 2. Database Schema (`migrations/0008_schedules_and_exceptions.sql`)

### 2.1 `operating_schedules`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6)`
- `open_time time NOT NULL`
- `close_time time NOT NULL`
- `is_closed boolean NOT NULL DEFAULT false`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT operating_schedules_venue_day_uniq UNIQUE (venue_id, day_of_week)`

### 2.2 `schedule_exceptions`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `date date NOT NULL`
- `is_closed boolean NOT NULL DEFAULT false`
- `open_time time`
- `close_time time`
- `reason text`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT schedule_exceptions_venue_date_uniq UNIQUE (venue_id, date)`

### 2.3 Grants
- `GRANT SELECT, INSERT, UPDATE, DELETE ON operating_schedules, schedule_exceptions TO gamerbooker_app;`

---

## 3. Acceptance Tests (`tests/eng101-schedules-and-availability.spec.ts`)
1. **Weekly Schedule CRUD & RBAC**:
   - OWNER/VENUE_MANAGER can set weekly operating hours (`PUT /v1/dashboard/venues/:id/schedule`).
   - RECEPTION receives 403 on schedule modification.
   - Cross-tenant schedule update returns 404 (T-018 row ownership).
2. **Exception Calendar Overrides**:
   - Creating a closure on Christmas Day overrides regular Friday hours.
   - Creating custom reduced hours on a specific date limits availability.
   - Deleting an exception restores weekly schedule behavior.
3. **Availability Engine**:
   - Regular available resource returns full operating window.
   - Resource in `MAINTENANCE` status returns no available slots.
   - Resource with `ACTIVE_HOLD` or `CONFIRMED` claim has that interval subtracted.
   - Private room with a booked component PC shows as unavailable during that slot.
   - Child PC belonging to a booked Private Room shows as unavailable during that slot.
   - Touching intervals `[10:00, 11:00)` and `[11:00, 12:00)` are distinct without collision.
