# HANDOFF-ENG-304: Online Remaining Balance and Reception Receipt Ledger

## 1. Goal & Architectural Scope
Delivers online remaining balance settlement and reception offline receipt ledger with managerial voiding for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-304)
- `docs/03-bookings/02-booking-lifecycle-and-state-machine.md`
- `docs/04-payments/01-payment-architecture.md`

Implements:
1. Online remaining balance settlement (`POST /v1/bookings/:id/pay-balance-online`), creating a PSP payment intent for outstanding balance under `ONLINE_OR_RECEPTION` settlement policy snapshot.
2. Balance payment capture webhook handling (`POST /v1/payments/capture-balance`) with atomic booking balance decrement, outbox event generation, and overpayment race condition compensation (refunds online capture if balance was already settled at reception).
3. Venue policy enforcement: rejects online balance payments if venue policy requires `RECEPTION_ONLY` settlement (`400 ONLINE_SETTLEMENT_NOT_ALLOWED`), or when balance is already zero (`400 NO_OUTSTANDING_BALANCE`).
4. Offline receipt ledger (`GET /v1/dashboard/venues/:venue_id/receipts`) supporting date range filters, staff ID filter, payment method filter, pagination, and aggregated collection metrics (`total_collected_minor`, `cash_collected_minor`, `card_collected_minor`, `voided_count`).
5. Role authorization: receipt ledger accessible to `OWNER`, `VENUE_MANAGER`, and `RECEPTION`; voiding restricted strictly to `OWNER` and `VENUE_MANAGER` (`403 AUTH_ROLE_NOT_PERMITTED`). Non-members receive `404 RESOURCE_NOT_FOUND` to prevent venue enumeration.
6. Safe receipt voiding (`POST /v1/dashboard/venues/:venue_id/receipts/:id/void`) restoring the booking's outstanding balance, requiring an audit reason (`400 MISSING_VOID_REASON`), and rejecting double voiding (`409 RECEIPT_ALREADY_VOIDED`).

## 2. Domain Invariants & Rules
1. **Policy Hierarchy Enforcement**:
   - Evaluates `deposit_mode_settlement` from booking's policy snapshot.
   - If set to `RECEPTION_ONLY`, online balance payment attempts reject with `400 ONLINE_SETTLEMENT_NOT_ALLOWED`.
2. **Race Condition & Overpayment Compensation**:
   - When capture arrives, the booking is locked with `SELECT FOR UPDATE`.
   - If desk staff already collected balance at reception (`balance_minor <= 0`), the engine immediately issues an automated refund via PSP and records a refund row (`BALANCE_ALREADY_SETTLED_OVERPAYMENT`).
   - If intent amount exceeds remaining balance, excess is refunded (`PARTIAL_EXCESS_OVERPAYMENT`).
3. **Ledger Aggregation & Void Integrity**:
   - Voids require non-empty `reason` string and venue manager or owner authorization.
   - Voiding atomically updates `voided_at`, `voided_by`, `void_reason` in `offline_receipts`, adjusts booking `balance_minor = balance_minor + amount_minor` and `paid_minor = max(0, paid_minor - amount_minor)`, and logs audit and outbox events.
   - Aggregate metrics calculate net valid collections (excluding voided receipts).

## 3. Database Schema
Migration `migrations/0022_receipt_ledger_and_online_balance.sql`:
- Extends `offline_receipts` table with `voided_at timestamptz`, `voided_by uuid REFERENCES users(id)`, and `void_reason text`.
- Adds index `offline_receipts_venue_created_idx` on `(venue_id, created_at DESC)`.
- Granted least-privilege `SELECT, INSERT, UPDATE` permissions to `gamerbooker_app`.

## 4. API Specification
- `POST /v1/bookings/:id/pay-balance-online`
  - Generates payment intent for customer to pay remaining balance online.
- `POST /v1/payments/capture-balance`
  - Webhook simulation for balance payment capture.
- `GET /v1/dashboard/venues/:venue_id/receipts`
  - Returns paginated list of receipts with aggregate collection summary metrics.
- `POST /v1/dashboard/venues/:venue_id/receipts/:id/void`
  - Managerial voiding of reception receipt with balance restoration.

## 5. Acceptance Verification Plan
Suite `tests/eng304-online-balance-and-receipt-ledger.spec.ts` (13/13 passed):
1. Creates PSP payment intent for outstanding balance under `ONLINE_OR_RECEPTION` policy.
2. Captures online balance payment and updates booking balance to zero.
3. Rejects online balance payment when booking balance is already zero (`400 NO_OUTSTANDING_BALANCE`).
4. Rejects online balance payment if venue policy requires `RECEPTION_ONLY` settlement (`400 ONLINE_SETTLEMENT_NOT_ALLOWED`).
5. Prohibits stranger from paying balance for another customer's booking (`403/404`).
6. Allows staff to list receipt ledger with aggregated collection metrics.
7. Filters receipts by payment method (`CASH`, `POS_TERMINAL`, etc.).
8. Prohibits customer from accessing reception receipt ledger (`404 RESOURCE_NOT_FOUND`).
9. Prevents reception staff from voiding receipt without manager authorization (`403 AUTH_ROLE_NOT_PERMITTED`).
10. Rejects voiding if reason is missing (`400 MISSING_VOID_REASON`).
11. Allows venue manager to void receipt, restoring outstanding balance to booking.
12. Rejects attempting to void an already voided receipt (`409 RECEIPT_ALREADY_VOIDED`).
13. Refunds online capture when desk staff already collected balance in full at reception.
