# HANDOFF - ENG-104 Atomic hold + private room component closure + expiry worker

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:17 (ENG-104), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue & resource hierarchy delivered (`ENG-003`).
- Operating schedules & availability engine delivered (`ENG-101`).
- Policy hierarchy, validator, and immutable snapshots delivered (`ENG-102`).
- Price quotes with minor-unit exact arithmetic and expiry delivered (`ENG-103`).

---

## Task Definition
`ENG-104 | Atomic hold + private room component closure + expiry worker | Valid server-signed quote ID, Idempotency-Key, authenticated customer session | Atomic multi-resource locking in sorted ID order, DAG private room component closure (room + all children), GiST exclusion conflict handling (409 RESOURCE_UNAVAILABLE), 15m hold TTL, transactional outbox HoldCreated, idempotent release, concurrent-safe expiry worker | POST /v1/holds, GET /v1/holds/:id, POST /v1/holds/:id/release, POST /v1/holds/cleanup-expired | holds, resource_claims, outbox_events | Customer checkout lock & booking countdown | RESOURCE_UNAVAILABLE, QUOTE_EXPIRED, QUOTE_SIGNATURE_INVALID, HOLD_NOT_FOUND, VENUE_CLOSED | Customer: hold creation, retrieval, release; System: background expiry worker | Concurrency-safe exclusion tests, private room atomic closure conflict tests, idempotent replay tests, automatic TTL expiration tests | hold_created, hold_expired, hold_released, claim_conflict | Bookings Core`

---

## 1. Domain Invariants & Rules

### 1.1 Atomic Resource Component Closure
- Atomic resources (`PC`, `CONSOLE_SETUP`):
  - Closure: `{resource_id}`.
- Composite resources (`PRIVATE_ROOM`):
  - Closure: `{parent_room_id, ...child_pc_ids}` where children are extracted via `resource_components`.
  - Claiming a `PRIVATE_ROOM` atomically places `ACTIVE_HOLD` claims on both the room itself and every child PC in the room.
  - Symmetrically, if any child PC is held or booked, any attempt to hold the `PRIVATE_ROOM` collides on that child PC via the database GiST exclusion constraint (`resource_claims_no_overlap`).
  - Sorted order: all resource IDs in the closure are sorted lexicographically before acquiring row locks (`SELECT ... FOR UPDATE`) to avoid deadlocks.

### 1.2 Defensive Expiry & Conflict Handling
- In-transaction defensive cleanup:
  - Expired active holds (`status = 'ACTIVE' AND expires_at <= now()`) are flipped to `EXPIRED` and their corresponding claims set to `RELEASED`.
- GiST exclusion collision:
  - If another transaction already holds any resource in the requested slot `[starts_at, ends_at)`, PostgreSQL raises an exclusion violation (`23P01`).
  - The service catches `23P01` and returns `409 Conflict` with error code `RESOURCE_UNAVAILABLE`.

### 1.3 Hold Lifecycle & Expiry Worker
- Status transitions:
  - `ACTIVE` -> `CONSUMED` (on booking confirmation in ENG-105)
  - `ACTIVE` -> `EXPIRED` (when `expires_at <= now()`)
  - `ACTIVE` -> `RELEASED` (when client or staff releases/cancels hold)
- Expiry worker:
  - Scans for `ACTIVE` holds past `expires_at` using concurrency-safe batching.
  - Updates `holds.status = 'EXPIRED'` and sets `resource_claims.state = 'RELEASED'`.
  - Emits `HoldExpired` outbox event.
- Idempotency:
  - Repeated release calls on an already expired/released hold return 200 without side effects.
  - `Idempotency-Key` header on `POST /v1/holds` returns the existing active hold if called repeatedly with the same key.

---

## 2. Database Schema (`migrations/0011_holds.sql`)

### 2.1 `holds` Table
```sql
CREATE TABLE IF NOT EXISTS holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE CASCADE,
  idempotency_key text UNIQUE,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'CONSUMED', 'RELEASED')),
  resource_ids uuid[] NOT NULL,
  atomic_resource_ids uuid[] NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 `resource_claims` Migration
- Add `hold_id uuid REFERENCES holds(id) ON DELETE CASCADE`.
- Update state check to include `'RELEASED'`.

### 2.3 `outbox_events` Table
```sql
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 3. Acceptance Verification Plan
1. **Component Closure Integrity**: Booking a `PRIVATE_ROOM` creates claims for both the room and all its child PCs.
2. **Bi-directional DAG Collision**:
   - Holding child PC blocks subsequent hold on the parent room (409 `RESOURCE_UNAVAILABLE`).
   - Holding parent room blocks subsequent hold on any child PC (409 `RESOURCE_UNAVAILABLE`).
3. **GiST Concurrency**: Two concurrent requests attempting to hold the same resource for overlapping slots result in exactly 1 success and 1 `409 RESOURCE_UNAVAILABLE`.
4. **Hold Expiry**:
   - Hold expires after TTL (15 minutes, or configured timestamp).
   - Once expired, claims become `RELEASED` and the resource is immediately available again for new holds.
5. **Idempotency**: Duplicate `POST /v1/holds` with same `Idempotency-Key` returns the identical hold.
6. **Explicit Release**: `POST /v1/holds/:id/release` transitions hold to `RELEASED` and releases claims immediately.
