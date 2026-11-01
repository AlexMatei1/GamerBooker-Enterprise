# HANDOFF-ENG-305: Refund Lifecycle, Daily Reconciliation Report, and Alerting

## 1. Goal & Architectural Scope
Delivers the complete refund state machine, daily financial reconciliation reporting, and discrepancy alerting for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-305)
- `docs/04-payments/03-refunds-reconciliation-and-settlement.md`
- `docs/04-payments/04-ledger-journal-and-examples.md`

Implements:
1. Refund lifecycle state machine (`REQUESTED → APPROVED → SUBMITTED → SUCCEEDED | FAILED_RETRYABLE | MANUAL_REVIEW`):
   - Manager initiation: transitions to `APPROVED` and auto-processes with payment provider to `SUCCEEDED`.
   - Reception staff request: transitions to `REQUESTED` requiring explicit manager approval (`403 AUTH_ROLE_NOT_PERMITTED` if non-manager attempts approval).
   - Manager approval: transitions to `APPROVED` and submits to payment provider.
   - Partial refunds: allows partial refunds up to the captured amount, rejecting any attempt exceeding the remaining non-refunded amount (`400 REFUND_AMOUNT_EXCEEDS_CAPTURED`).
   - Idempotency deduplication: duplicate requests with the same `idempotency_key` return existing record without re-processing.
   - Failure & retry policy: PSP failures transition to `FAILED_RETRYABLE`; retries are tracked with exponential/manager retry, and max retries transition to `MANUAL_REVIEW`, triggering a `STUCK_REFUND` alert.
2. Daily financial reconciliation report (`GET /v1/dashboard/venues/:venue_id/reconciliation/daily?date=YYYY-MM-DD`):
   - Computes penny-accurate opening balance, online PSP captures, online PSP refunds, net online minor, reception cash collections, reception card collections, voided offline receipts, total collected minor, and closing balance.
   - Chains consecutive daily reports: Day 2 opening balance automatically matches Day 1 closing balance.
   - Manager report closing (`POST /v1/dashboard/venues/:venue_id/reconciliation/daily/close`) updating status to `RECONCILED` with audit notes.
3. Anomaly detection & automated alerting:
   - Detects orphan intents (`ORPHAN_INTENT`): captured payment intents with no linked booking or group booking.
   - Detects stuck refunds (`STUCK_REFUND`) in retryable/manual review states.
   - Detects high void volume (`HIGH_VOID_VOLUME`) when voided receipts exceed 20% or threshold count.
   - Discrepancy flagging: sets daily report status to `DISCREPANCY_FLAGGED` and inserts alerts into `reconciliation_alerts`.
   - Alert management: list alerts (`GET .../reconciliation/alerts`) and acknowledge alert (`POST .../reconciliation/alerts/:id/acknowledge`) with manager note.
4. Security & RBAC boundaries:
   - Customers receive `404 RESOURCE_NOT_FOUND` on venue reconciliation and dashboard refund endpoints (preserving VenueRoleGuard anti-enumeration invariant).
   - Reception staff restricted from approving refunds or viewing daily reconciliation reports (`403 AUTH_ROLE_NOT_PERMITTED`).
   - Cross-venue isolation enforced between distinct venues.

## 2. Domain Invariants & Rules
1. **Refund Overpayment Protection**:
   - `sum(existing_active_refunds) + requested_amount <= payment_intent.amount_minor`
   - Verified under PostgreSQL row lock (`SELECT ... FOR UPDATE`).
2. **Sequential Reconciliation Balance Chain**:
   - `closing_balance_minor = opening_balance_minor + total_collected_minor`
   - `total_collected_minor = net_online_minor + reception_cash_minor + reception_card_minor`
   - `net_online_minor = online_captures_minor - online_refunds_minor`
   - Opening balance of day $N+1$ matches closing balance of day $N$.
3. **Audit & Outbox Integrity**:
   - Emits transactional outbox events: `RefundRequested`, `RefundSucceeded`.
   - Emits audit events: `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_SUCCEEDED`.

## 3. Database Schema
Migration `migrations/0023_refund_lifecycle_and_reconciliation.sql`:
- Extends `refunds` table: `approved_by uuid REFERENCES users(id)`, `approved_at timestamptz`, `submitted_at timestamptz`, `processed_at timestamptz`, `failure_reason text`, `retry_count integer`, `idempotency_key text`.
- Adds `reconciliation_reports` table with unique constraint on `(venue_id, report_date)`.
- Adds `reconciliation_alerts` table tracking financial anomalies and staff acknowledgements.
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/refunds` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/refunds` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/refunds/:id/approve` (`OWNER`, `VENUE_MANAGER`)
- `POST /v1/dashboard/venues/:venue_id/refunds/:id/process` (`OWNER`, `VENUE_MANAGER`)
- `POST /v1/dashboard/venues/:venue_id/refunds/:id/retry` (`OWNER`, `VENUE_MANAGER`)
- `GET /v1/dashboard/venues/:venue_id/reconciliation/daily` (`OWNER`, `VENUE_MANAGER`)
- `POST /v1/dashboard/venues/:venue_id/reconciliation/daily/close` (`OWNER`, `VENUE_MANAGER`)
- `GET /v1/dashboard/venues/:venue_id/reconciliation/alerts` (`OWNER`, `VENUE_MANAGER`)
- `POST /v1/dashboard/venues/:venue_id/reconciliation/alerts/:id/acknowledge` (`OWNER`, `VENUE_MANAGER`)

## 5. Acceptance Verification Plan
Suite `tests/eng305-refund-lifecycle-and-reconciliation.spec.ts` (13/13 passed):
1. Allows venue manager to initiate and auto-process refund to `SUCCEEDED`.
2. Reception staff refund request transitions to `REQUESTED` requiring manager approval.
3. Supports partial refunds and enforces captured amount limit (`400 REFUND_AMOUNT_EXCEEDS_CAPTURED`).
4. Rejects refund with non-positive amount or missing reason.
5. Deduplicates refund request using idempotency key.
6. Allows staff to list venue refunds with aggregate summary metrics.
7. Handles refund retry and triggers manual review on max retries.
8. Computes penny-accurate opening, online captures, refunds, cash/card collections, and closing balance.
9. Chains closing balance of day 1 into opening balance of day 2.
10. Flags `ORPHAN_INTENT` anomaly when a captured intent has no linked booking and creates an alert.
11. Prohibits customer from accessing venue reconciliation or refund management (`404 RESOURCE_NOT_FOUND`).
12. Prohibits reception staff from viewing daily reconciliation report (`403 AUTH_ROLE_NOT_PERMITTED`).
13. Enforces cross-venue boundary: staff from Venue B cannot access Venue A refunds.
