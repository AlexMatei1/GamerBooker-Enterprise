# HANDOFF-ENG-206: Live Floor and Calendar, Check-in Scanner, Maintenance Blocks

## 1. Goal & Architectural Scope
Delivers the Reception and Management Operational Dashboard for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-206)
- `docs/05-venue-dashboard/01-dashboard-modules-and-navigation.md`
- `docs/05-venue-dashboard/04-roles-onboarding-and-audit.md`

## 2. Domain Invariants & Rules
1. **Real-time Live Floor Status Hierarchy**:
   - Each venue resource resolves to one of five mutually exclusive real-time operational states:
     - `MAINTENANCE`: Resource is flagged `status = 'MAINTENANCE'` or has an active scheduled maintenance block overlapping `now()`.
     - `TEMP_BLOCKED`: Resource is flagged `status = 'TEMP_BLOCKED'`.
     - `OCCUPIED`: Resource has an active booking claim overlapping `now()` with booking status `CHECKED_IN`.
     - `BOOKED`: Resource has an active booking claim overlapping `now()` with booking status `CONFIRMED`.
     - `AVAILABLE`: Resource is bookable and has no active claims, locks, or maintenance at `now()`.
   - Never exposes sensitive customer PII on live map (emails are masked e.g. `c***@example.com`).
2. **Exclusion-Guarded Maintenance Blocks**:
   - Scheduled maintenance blocks acquire an exclusion claim in `resource_claims` with `claim_type = 'MAINTENANCE'` and `state = 'CONFIRMED'`.
   - GiST exclusion prevents maintenance scheduling if customers already hold confirmed bookings or active holds on the resource during that window (`409 RESOURCE_MAINTENANCE_CONFLICT`).
   - Active maintenance claims automatically subtract from public availability calculations.
   - Cancelling a maintenance block transitions the claim to `RELEASED`, immediately restoring public booking eligibility.
3. **Reception Calendar & Check-in Queue**:
   - Calendar aggregates bookings within any arbitrary range (`from` to `to`, clamped to max 31 days) with financial breakdowns (`paid_minor`, `total_minor`, `balance_minor`, `status`).
   - Check-in Queue filters bookings arriving soon (`starts_at <= now() + 2h` and `ends_at >= now()`) in `CONFIRMED` or `CHECKED_IN` status, sorted by start time.
   - Seamlessly links to the QR check-in scanner and reception balance payment operations delivered in ENG-106.

## 3. Database Schema (`migrations/0016_maintenance_blocks.sql`)
- Table `maintenance_blocks`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
  - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE`
  - `created_by_user_id uuid NOT NULL REFERENCES users(id)`
  - `reason text NOT NULL`
  - `starts_at timestamptz NOT NULL`
  - `ends_at timestamptz NOT NULL`
  - `status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))`
  - `claim_id uuid REFERENCES resource_claims(id) ON DELETE SET NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- Updates `resource_claims.claim_type` check constraint to allow `'MAINTENANCE'`.
- Privileges granted to `gamerbooker_app`: `SELECT, INSERT, UPDATE, DELETE`.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/live-floor`
  - Returns all venue resources with computed `current_status` (`AVAILABLE`, `BOOKED`, `OCCUPIED`, `MAINTENANCE`, `TEMP_BLOCKED`), active booking details, and active maintenance block info.
- `GET /v1/dashboard/venues/:venue_id/calendar?from=&to=&room_id=&zone_id=&status=`
  - Returns range-bounded booking entries and summary metrics (`total_bookings`, `confirmed_count`, `checked_in_count`, `revenue_minor`, `outstanding_balance_minor`).
- `GET /v1/dashboard/venues/:venue_id/checkin-queue`
  - Returns today's active/upcoming check-in queue with outstanding balance indicators.
- `POST /v1/dashboard/venues/:venue_id/resources/:id/maintenance-blocks`
  - Creates a maintenance block and exclusion claim. Rejects with 409 `RESOURCE_MAINTENANCE_CONFLICT` if active booking overlaps.
- `GET /v1/dashboard/venues/:venue_id/maintenance-blocks`
  - Lists maintenance blocks filtered by `resource_id` or `status`.
- `POST /v1/dashboard/venues/:venue_id/maintenance-blocks/:id/cancel`
  - Cancels maintenance block and releases the exclusion claim.

## 5. Acceptance Verification Plan
Suite `tests/eng206-live-floor-and-calendar.spec.ts`:
1. Live floor computes `AVAILABLE` for idle resources.
2. Live floor transitions resource to `BOOKED` when confirmed booking starts.
3. Checking in transitions resource from `BOOKED` to `OCCUPIED` in real-time.
4. Live floor masks customer email and does not leak unneeded PII.
5. Calendar queries bookings in date window and aggregates status counts and revenue metrics.
6. Check-in queue lists today's eligible bookings arriving within 2h window sorted by start time.
7. Creating maintenance block succeeds when slot is clear, creating exclusion claim in DB.
8. Creating maintenance block overlapping an existing confirmed booking fails with 409 `RESOURCE_MAINTENANCE_CONFLICT`.
9. Active maintenance block reflects as `MAINTENANCE` status on live floor.
10. Cancelling maintenance block releases claim, returning resource to `AVAILABLE`.
11. RBAC: `OWNER`, `VENUE_MANAGER`, `RECEPTION` can view floor, calendar, queue; only `OWNER` and `VENUE_MANAGER` can create/cancel maintenance blocks.
