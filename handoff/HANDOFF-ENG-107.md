# HANDOFF - ENG-107 Client cancel/modify/extend and compensating workflows

Status: proposed, ready for implementation.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:20 (ENG-107), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue & resource hierarchy delivered (`ENG-003`).
- Operating schedules & availability engine delivered (`ENG-101`).
- Policy hierarchy, validator, and immutable snapshots delivered (`ENG-102`).
- Price quotes with minor-unit exact arithmetic delivered (`ENG-103`).
- Atomic hold, component closure, and expiry worker delivered (`ENG-104`).
- Booking confirmation guard and state machine delivered (`ENG-105`).
- Solo checkout, rolling QR tokens, and reception check-in delivered (`ENG-106`).

---

## Task Definition
`ENG-107 | Client cancel/modify/extend and compensating workflows | Booking ID, cancellation reason, reschedule quote/hold, in-session extension minutes, staff no-show verification | Policy-governed free vs late cancellation with penalty calculation and automatic refund queuing; atomic reschedule with change quote and rollback safety; contiguous in-session extension (+15/+30/+60m) with availability check and claim extension; staff-verified no-show with equipment release; append-only audit trail and transactional outbox events | POST /v1/bookings/:id/cancel-policy, POST /v1/bookings/:id/reschedule, POST /v1/bookings/:id/extend, POST /v1/dashboard/venues/:venue_id/bookings/:id/no-show | refunds, bookings, resource_claims, audit_events, outbox_events | Booking Detail Actions, Reschedule Screen, Extension Bar, Staff No-Show Scanner | CANCELLATION_NOT_PERMITTED, RESCHEDULE_CUTOFF_EXCEEDED, EXTENSION_UNAVAILABLE, EXTENSION_EXCEEDS_MAX_DURATION, NO_SHOW_GRACE_ACTIVE | Customer: cancel with refund calculation, reschedule, extend session; Staff: no-show verification and equipment release | Policy penalty calculation tests, free vs late cancel refund tests, reschedule atomic swap & compensation tests, contiguous extension tests, no-show verification tests | booking_cancelled, refund_requested, booking_rescheduled, booking_extended, booking_no_show | Bookings Lifecycle Core`

---

## 1. Domain Invariants & Rules

### 1.1 Policy-Governed Cancellation & Refund Calculation
- Cancellation evaluates the frozen `policy_snapshot` from booking confirmation:
  - `free_cancellation_hours` (e.g. 3 hours before `starts_at`).
  - `late_cancellation_penalty_percent` (e.g. 20% of `paid_minor`).
- Time-based penalty:
  - If `now() <= starts_at - free_cancellation_hours`:
    - `penalty_minor = 0`
    - `refundable_minor = paid_minor`
    - `cancellation_type = 'FREE'`
  - If `starts_at - free_cancellation_hours < now() < starts_at`:
    - `penalty_minor = Math.round((paid_minor * late_cancellation_penalty_percent) / 100)`
    - `refundable_minor = paid_minor - penalty_minor`
    - `cancellation_type = 'LATE_WITH_PENALTY'`
  - If `now() >= starts_at`:
    - Cancellation not permitted after session start (reject with 400 `CANCELLATION_NOT_PERMITTED`).
- Atomic Execution:
  - Transitions booking to `CANCELLED`.
  - Transitions `resource_claims` to `CANCELLED`, freeing the slot under GiST exclusion.
  - If `refundable_minor > 0`, records entry in `refunds` table (`status = 'REQUESTED'`).
  - Emits `BookingCancelled` and `RefundRequested` outbox events.

### 1.2 Atomic Reschedule (Modify Slot / Resources)
- Guard:
  - `now() <= starts_at - reschedule_cutoff_hours` (e.g. 4 hours).
  - Rejects if within cutoff window with 400 `RESCHEDULE_CUTOFF_EXCEEDED`.
- Flow:
  1. Client creates a valid quote and hold for the target interval/resources.
  2. Submits reschedule request referencing `booking_id` and new `hold_id`.
  3. Calculates financial delta:
     - `delta_total_minor = new_quote.total_minor - current_booking.total_minor`.
     - `delta_due_now = new_quote.due_now_minor - current_booking.paid_minor`.
  4. If `delta_due_now > 0`: requires additional payment authorization.
  5. In transaction:
     - Releases previous `resource_claims` (`state = 'CANCELLED'`).
     - Converts new hold claims to `CONFIRMED` under this `booking_id`.
     - Updates booking interval, resources, prices, and increments `version`.
     - Marks new hold as `CONSUMED`.
     - Emits `BookingRescheduled` outbox event and audit log.

### 1.3 Contiguous In-Session Extension
- Customer or staff requests extension of `+15`, `+30`, or `+60` minutes.
- Eligibility & Contiguity:
  - Booking must be in `CONFIRMED` or `CHECKED_IN` status.
  - Extension interval begins exactly at current `ends_at`:
    `extension_slot = [ends_at, ends_at + additional_minutes)`.
  - Extension duration must align with venue `slot_granularity_minutes`.
  - Total duration (`current_duration + additional_minutes`) must not exceed `max_duration_minutes`.
  - Checks GiST exclusion constraint on active claims for all atomic resources over `extension_slot`.
  - If any atomic resource is occupied/held, throws 409 `EXTENSION_UNAVAILABLE`.
- In transaction:
  - Inserts new claims for `extension_slot` (`state = 'CONFIRMED'`, linked to `booking_id`).
  - Extends booking `ends_at = ends_at + additional_minutes`, updates `total_minor` and `paid_minor`, increments `version`.
  - Emits `BookingExtended` outbox event and audit log.

### 1.4 No-Show Staff Verification & Equipment Release
- Guard:
  - `now() >= starts_at + no_show_grace_minutes` (e.g. 15 minutes after start).
  - If within grace window, rejects with 400 `NO_SHOW_GRACE_ACTIVE`.
- Staff verification:
  - Requires staff actor and confirmation `staff_verified_empty = true`.
- In transaction:
  - Transitions booking to `NO_SHOW`.
  - Releases `resource_claims` (`state = 'RELEASED'`) so the station can be re-sold to walk-in customers.
  - Calculates penalty based on `no_show_fee_percent` (e.g. 100% forfeiture).
  - Emits `BookingNoShow` outbox event and audit log.

---

## 2. Database Schema (`migrations/0014_refunds_and_lifecycle.sql`)

```sql
CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  status text NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'SUBMITTED', 'SUCCEEDED', 'FAILED_RETRYABLE', 'MANUAL_REVIEW')),
  reason text NOT NULL,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON refunds TO gamerbooker_app;
```

---

## 3. Acceptance Verification Plan
1. **Free Cancellation**: Cancelling >= 3h before start yields 100% refund (`amount_minor === paid_minor`), 0 penalty, releases claims.
2. **Late Cancellation with Penalty**: Cancelling < 3h before start calculates exact penalty percentage, queues partial refund, releases claims.
3. **Session Start Cancellation Guard**: Cancelling after session start is rejected (400 `CANCELLATION_NOT_PERMITTED`).
4. **Reschedule Swap & Compensation**: Rescheduling moves claims to new slot, updates booking times/prices, and preserves original booking on conflict.
5. **Reschedule Cutoff Guard**: Rescheduling closer than cutoff window is rejected (400 `RESCHEDULE_CUTOFF_EXCEEDED`).
6. **Contiguous In-Session Extension**: Adding 30m extends `ends_at`, inserts new claims, updates totals.
7. **Extension Collision Detection**: Attempting to extend when subsequent slot is held by another customer returns 409 `EXTENSION_UNAVAILABLE`.
8. **Staff No-Show Verification**: Marking no-show after grace period releases claims for walk-in re-sale and logs staff verification.
