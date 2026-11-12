# HANDOFF - ENG-105 Booking confirmation guard and state machine with audit/outbox

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:18 (ENG-105), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue & resource hierarchy delivered (`ENG-003`).
- Operating schedules & availability engine delivered (`ENG-101`).
- Policy hierarchy, validator, and immutable snapshots delivered (`ENG-102`).
- Price quotes with minor-unit exact arithmetic delivered (`ENG-103`).
- Atomic hold, component closure, and expiry worker delivered (`ENG-104`).

---

## Task Definition
`ENG-105 | Booking confirmation guard and state machine with audit/outbox | Valid active hold ID, optional payment reference / authorization, customer session / staff actor | Invariant: hold MUST be strictly ACTIVE (now < expires_at); atomic transition hold CONSUMED and resource claims CONFIRMED; generate unique human-readable public booking code (GB-XXXXXX); immutable price & policy snapshots; guarded state machine (CONFIRMED -> CHECKED_IN -> COMPLETED, or CANCELLED, NO_SHOW); optimistic version checks; append-only audit log and transactional outbox event | POST /v1/bookings/confirm, GET /v1/bookings/:id, GET /v1/bookings/code/:code, POST /v1/bookings/:id/transition | bookings, resource_claims, audit_events, outbox_events | Booking Confirmation & Order Details | HOLD_NOT_ACTIVE, HOLD_EXPIRED, INVALID_STATE_TRANSITION, CONCURRENCY_CONFLICT, BOOKING_NOT_FOUND | Customer: confirm, view own; Venue Staff: view venue bookings, transition status | Concurrency-safe confirmation tests, hold expiry guard tests, state machine lifecycle tests, optimistic lock conflict tests, outbox & audit emission | booking_confirmed, booking_cancelled, booking_checked_in, booking_completed, booking_no_show | Bookings Core`

---

## 1. Domain Invariants & Rules

### 1.1 Hold Confirmation Guard
- A booking can ONLY be confirmed from an `ACTIVE` hold.
- If `server_now >= hold.expires_at`:
  - Hold is strictly expired. Confirmation is refused with HTTP 409 `HOLD_EXPIRED`.
  - Claims are not converted; paid funds (if any) are directed to the refund/settlement queue as unassigned payments.
- If hold status is `CONSUMED`, `RELEASED`, or `EXPIRED`:
  - If `CONSUMED` and called with the same `Idempotency-Key` or by the same customer for the same hold, return the existing booking (idempotency).
  - Otherwise, return HTTP 409 `HOLD_NOT_ACTIVE`.
- Atomic Lock Conversion:
  - In a single database transaction:
    1. Lock hold row (`SELECT ... FOR UPDATE`).
    2. Validate hold `status === 'ACTIVE'` and `expires_at > now()`.
    3. Update hold `status = 'CONSUMED'`.
    4. Update all `resource_claims` associated with this `hold_id`:
       `state = 'CONFIRMED'`, `booking_id = booking.id`.
    5. Insert row into `bookings` (`status = 'CONFIRMED'`).
    6. Insert into `audit_events` (`action = 'BOOKING_CONFIRMED'`).
    7. Insert into `outbox_events` (`event_type = 'BookingConfirmed'`).

### 1.2 State Machine & Optimistic Concurrency
- States:
  - `CONFIRMED`: initial state upon successful confirmation.
  - `CHECKED_IN`: staff scanner verified check-in.
  - `COMPLETED`: session finished normally.
  - `CANCELLED`: cancelled before start (claims set to `CANCELLED`).
  - `NO_SHOW`: grace period passed without arrival.
- Transition Matrix:
  - `CONFIRMED` -> `CHECKED_IN`
  - `CONFIRMED` -> `CANCELLED`
  - `CONFIRMED` -> `NO_SHOW`
  - `CHECKED_IN` -> `COMPLETED`
  - `CHECKED_IN` -> `CANCELLED` (exceptional early termination)
  - All other transitions are rejected with HTTP 400 `INVALID_STATE_TRANSITION`.
- Optimistic Concurrency (`version`):
  - Every update checks `WHERE id = $1 AND version = $expected_version`.
  - Increments `version = version + 1`.
  - If no row matches, throws HTTP 409 `CONCURRENCY_CONFLICT`.
- Claim Freeing on Cancellation:
  - If transitioning to `CANCELLED`, all `resource_claims` for this booking are immediately transitioned to `state = 'CANCELLED'`, freeing the slot under the GiST exclusion constraint.

### 1.3 Public Booking Code Generation
- Unique public booking code format: `GB-` followed by 6 cryptographic uppercase alphanumeric characters (e.g. `GB-7K2M9X`), collision-resistant and URL-safe.

---

## 2. Database Schema (`migrations/0012_bookings.sql`)

### 2.1 `bookings` Table
```sql
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hold_id uuid REFERENCES holds(id) ON DELETE SET NULL,
  quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'COMPLETED')),
  type text NOT NULL DEFAULT 'SINGLE' CHECK (type IN ('SINGLE', 'GROUP')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Bucharest',
  resource_ids uuid[] NOT NULL,
  atomic_resource_ids uuid[] NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  due_now_minor bigint NOT NULL CHECK (due_now_minor > 0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  currency text NOT NULL DEFAULT 'RON',
  price_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  idempotency_key text UNIQUE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resource_claims ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE;
```

---

## 3. Acceptance Verification Plan
1. **Hold Confirmation & Claims Atomic Conversion**:
   - Confirm active hold -> creates `CONFIRMED` booking.
   - Resource claims converted from `ACTIVE_HOLD` to `CONFIRMED` with `booking_id`.
   - Hold status becomes `CONSUMED`.
   - Outbox event `BookingConfirmed` and audit record `BOOKING_CONFIRMED` created in same transaction.
2. **Expired Hold Confirmation Guard**:
   - Hold past `expires_at` -> 409 `HOLD_EXPIRED`.
   - No booking created, no claims converted.
3. **Released Hold Guard**:
   - Released hold -> 409 `HOLD_NOT_ACTIVE`.
4. **Idempotency Protection**:
   - Re-confirming with same `Idempotency-Key` or for already consumed hold returns existing booking without errors.
5. **State Machine Lifecycle & Concurrency**:
   - `CONFIRMED` -> `CHECKED_IN` -> `COMPLETED` succeeds with version increment.
   - Invalid transition (`CONFIRMED` -> `COMPLETED` directly) rejected with 400 `INVALID_STATE_TRANSITION`.
   - Wrong expected version rejected with 409 `CONCURRENCY_CONFLICT`.
6. **Cancellation & Claim Freeing**:
   - Transition to `CANCELLED` updates claims to `state = 'CANCELLED'`, re-opening the slot for new holds/bookings.
   - Emits `BookingCancelled` outbox event.
7. **RBAC & Cross-Tenant Isolation**:
   - Customer can only fetch their own bookings.
   - Venue staff can view/transition bookings for their venue.
   - Cross-tenant access denied with 404/403.
