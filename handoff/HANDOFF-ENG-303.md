# HANDOFF-ENG-303: Organizer Pay-All and Pay-Difference Safety

## 1. Goal & Architectural Scope
Delivers the difference breakdown and safe pay-difference mechanisms for group bookings in GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-303)
- `docs/03-bookings/03-group-bookings-and-split-pay.md`
- `docs/04-payments/01-payment-architecture.md`

Implements:
1. Difference breakdown and summary endpoint (`GET /v1/group-bookings/:id/difference-summary`) presenting an exact financial overview of total minor, due-now minor, total paid minor, outstanding difference minor, countdown seconds remaining, and partitioned lists of paid vs delinquent/unpaid participants with exact unpaid share amounts.
2. Safe pay-difference operation (`POST /v1/group-bookings/:id/pay-difference`) allowing the organizer to cover remaining uncollected due-now obligations before hold TTL expiration, generating an exact-difference PSP payment intent.
3. Atomic confirmation upon capturing the difference payment, transitioning the group booking to `CONFIRMED` and creating a confirmed booking with public Crockford code (`GB-XXXXXX`).
4. Re-allocation and double-charging protection: if a participant's capture arrives late after the organizer already covered their share and confirmed the booking, the engine automatically issues a compensating refund (`SHARE_ALREADY_COVERED_BY_ORGANIZER`), preventing overcharging.
5. Role authorization and precondition guards: non-organizers are barred from paying the difference (`403 NOT_GROUP_ORGANIZER`), expired bookings reject difference payments (`409 GROUP_BOOKING_EXPIRED`), uninitiated checkouts reject with `409 INVALID_GROUP_STATUS`, and already-paid groups reject with `400 NO_OUTSTANDING_DIFFERENCE`.

## 2. Domain Invariants & Rules
1. **Organizer Authorization**:
   - Only the group organizer can execute `pay-difference` (`403 NOT_GROUP_ORGANIZER`).
   - Difference summary access is restricted to members and organizer (`403 FORBIDDEN_GROUP_ACCESS`).
2. **Difference Calculation Invariant**:
   - `outstanding_difference_minor = max(0, due_now_minor - total_paid_minor)`
   - Difference payment intent is created for this exact non-negative integer amount.
   - If `outstanding_difference_minor <= 0`, operation is rejected (`400 NO_OUTSTANDING_DIFFERENCE`).
3. **Atomic Group Confirmation**:
   - Upon capturing the difference payment, the group booking transitions to `CONFIRMED` atomically via `BookingsService.confirmBooking`.
   - Resource claims transition from `ACTIVE_HOLD` to `CONFIRMED`.
   - Emits transactional audit event `GROUP_PAY_DIFFERENCE_INITIATED` and outbox event `GroupBookingConfirmed`.
4. **Zero Double-Charge Guard**:
   - If a participant payment capture arrives after the booking is already confirmed, the engine marks the intent `CAPTURED` and immediately executes a compensating refund (`SHARE_ALREADY_COVERED_BY_ORGANIZER`).
   - A corresponding entry is written to `refunds` table and audit event `GROUP_PAYMENT_REFUNDED_ALREADY_COVERED` is emitted.

## 3. Database Schema
Uses existing `group_bookings`, `group_participants`, `payment_intents`, and `refunds` tables with `gamerbooker_app` least privilege role.

## 4. API Specification
- `GET /v1/group-bookings/:id/difference-summary`
  - Returns difference summary and participant breakdown (`DifferenceSummaryResult`).
  - Allowed for organizer and participants.
- `POST /v1/group-bookings/:id/pay-difference`
  - Generates payment intent for the organizer covering the uncollected due-now difference (`PayDifferenceResult`).
  - Allowed for organizer only.

## 5. Acceptance Verification Plan
Suite `tests/eng303-organizer-pay-difference.spec.ts` (8/8 passed):
1. Returns accurate difference breakdown before any payments are made.
2. Prohibits stranger from accessing difference summary (`403 FORBIDDEN_GROUP_ACCESS`).
3. Prohibits non-organizer participant from executing pay-difference (`403 NOT_GROUP_ORGANIZER`).
4. Rejects pay-difference if checkout was not yet initiated (`409 INVALID_GROUP_STATUS`).
5. Rejects pay-difference if group booking has expired (`409 GROUP_BOOKING_EXPIRED`).
6. Creates intent for 100% due-now difference and confirms booking upon capture.
7. Allows organizer to cover only unpaid share and atomically confirms booking.
8. Refunds late participant capture if organizer already covered their share (`SHARE_ALREADY_COVERED_BY_ORGANIZER`).
