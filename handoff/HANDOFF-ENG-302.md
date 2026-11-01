# HANDOFF-ENG-302: Per-Payer PSP Intent, Completion Checks, and Timeout Compensation

## 1. Goal & Architectural Scope
Delivers the complete multi-payer payment processing, atomic completion checks, and timeout compensation engine for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-302)
- `docs/03-bookings/03-group-bookings-and-split-pay.md`
- `docs/04-payments/01-payment-architecture.md`

Implements:
1. Group checkout initiation and atomic hold acquisition with 15-minute TTL, requiring acceptance from all invited participants in `SPLIT_BY_PARTICIPANT` mode.
2. Per-payer PSP intent creation linked to `group_bookings` and `group_participants` tables, supporting both `SPLIT_BY_PARTICIPANT` (individual due-now shares) and `ORGANIZER_PAYS_ALL` (100% due-now).
3. Idempotent payment capture handler (`handlePaymentCaptured`) and webhook capture listeners (`PaymentsService.onPaymentCaptured`).
4. Atomic completion check: once the cumulative captured shares equal or exceed `group_booking.due_now_minor`, the booking is confirmed atomically via `BookingsService.confirmBooking`, converting resource claims from `ACTIVE_HOLD` to `CONFIRMED` and generating a Crockford public code (`GB-XXXXXX`).
5. Timeout compensation worker (`expireGroupBooking`): when a group booking expires before full payment, the under-allocated hold is released and compensating refunds are executed for all captured participants.
6. Zero-resurrection guard: if a PSP capture webhook arrives after the group booking's TTL has expired (`isExpired === true`), the intent is refunded immediately without resurrecting or confirming the booking.

## 2. Domain Invariants & Rules
1. **Payer Scoping & Role Permissions**:
   - Only the organizer can initiate checkout (`403 NOT_GROUP_ORGANIZER`).
   - Checkout cannot be initiated if invited participants are still pending (`400 PENDING_INVITATIONS_EXIST`).
   - In `SPLIT_BY_PARTICIPANT`, participants can only create payment intents for their own due-now shares (`403 FORBIDDEN_PAYMENT`).
   - In `ORGANIZER_PAYS_ALL`, only the organizer can create payment intents (`403 NOT_GROUP_ORGANIZER`).
2. **Idempotent Capture**:
   - Payment intents track `CAPTURED` state. Duplicate webhook or capture calls are processed idempotently without double-crediting `share_paid_minor`.
3. **Atomic Completion Invariant**:
   - `group_booking.status` remains `PENDING_PAYMENTS` until `sum(share_paid_minor) >= due_now_minor`.
   - Upon meeting the due-now threshold while the hold is active, `BookingsService.confirmBooking` runs atomically.
   - Emits `audit_events` (`GROUP_BOOKING_CONFIRMED`) and `outbox_events` (`GroupBookingConfirmed`).
4. **Timeout Compensation (N Paid + Expired -> 0 Booking, N Refunds)**:
   - When a group booking times out before all shares are paid, `group_bookings.status` transitions to `EXPIRED`.
   - Underlying resource hold is released.
   - For every participant with captured funds, a compensating refund is executed with the PSP and recorded in `refunds` table (`reason = 'GROUP_BOOKING_TIMEOUT_EXPIRED'`).
   - 0 bookings are confirmed in `bookings` table.
5. **Zero-Resurrection Guard**:
   - Late capture arriving after group booking or hold TTL is immediately refunded (`PSP_CONFIRM_AFTER_TTL_REFUND`).
   - Group booking remains `EXPIRED` without resurrection.

## 3. Database Schema
Defined in `migrations/0021_group_payments.sql`:
- `payment_intents`:
  - `group_booking_id uuid REFERENCES group_bookings(id) ON DELETE SET NULL`
  - `group_participant_id uuid REFERENCES group_participants(id) ON DELETE SET NULL`
  - Indexes on `group_booking_id` and `group_participant_id`.
- `refunds`:
  - `group_booking_id uuid REFERENCES group_bookings(id) ON DELETE SET NULL`
  - `payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL`
  - Indexes on `group_booking_id` and `payment_intent_id`.
- Grants to `gamerbooker_app` role.

## 4. API Specification
- `POST /v1/group-bookings/:id/checkout/initiate`
  - Initiates checkout and acquires atomic hold for the group booking.
  - Allowed for organizer.
- `POST /v1/group-bookings/:id/payment-intent`
  - Generates per-payer PSP payment intent for participant share or organizer total.
  - Allowed for participants / organizer.
- `POST /v1/group-bookings/:id/expire`
  - Times out group booking, releases hold, and executes compensating refunds.
- `POST /v1/group-bookings/payments/capture`
  - Processes PSP payment capture, executes completion check, or executes post-TTL refund.

## 5. Acceptance Verification Plan
Suite `tests/eng302-group-payments-and-timeout.spec.ts` (12/12 passed):
1. Rejects initiating checkout before all invited participants accept (`400 PENDING_INVITATIONS_EXIST`).
2. Rejects non-organizer attempting to initiate checkout (`403 NOT_GROUP_ORGANIZER`).
3. Successfully initiates checkout and acquires atomic hold once participants accept.
4. Allows participant to create payment intent for their exact share due-now.
5. Prohibits non-organizer participant from creating intent for someone else (`403 FORBIDDEN_PAYMENT`).
6. Prohibits unrelated user from creating payment intent (`403 FORBIDDEN_GROUP_ACCESS`).
7. Keeps group in `PENDING_PAYMENTS` when only first participant pays.
8. Handles duplicate webhook capture idempotently without duplicate share counting.
9. Atomically confirms booking when all participants finish paying.
10. Expires group booking, releases hold, and initiates compensating refunds for paid participants.
11. Rejects resurrecting expired group booking and immediately refunds late capture.
12. Allows organizer to pay 100% due-now in one transaction and immediately confirms in `ORGANIZER_PAYS_ALL` mode.
