# HANDOFF-ENG-504: End-to-End Reliability, Chaos PSP/Refund/Concurrency, and DST Tests

## 1. Goal & Architectural Scope
Delivers comprehensive end-to-end reliability verification, chaos fault injection (PSP webhook replay, late capture compensation, crash recovery), high-concurrency race condition protections (atomic holds, out-of-stock cart checkouts, duplicate handoff, receipt voiding), and strict Daylight Saving Time (DST) validation for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-504)
- `docs/02-architecture/04-nonfunctional-and-reliability.md`
- `docs/10-testing/01-test-strategy-and-acceptance.md` (T-015, T-016, T-025, T-026, T-029, T-030)

Implements:
1. **Daylight Saving Time (DST) Invariant Engine (`timezone.validator.ts`)**:
   - `validateTimezoneSlot`:
     - Enforces explicit timezone offsets on incoming ISO timestamps.
     - **T-025 (Spring-Forward Gap)**: Blocks quote and hold requests attempting to select the non-existent local hour (03:00 to 03:59:59 on spring-forward Sunday in `Europe/Bucharest`), throwing `400 DST_INVALID_LOCAL_TIME`.
     - **T-026 (Fall-Back Duplicate Hour)**: Strictly rejects timestamps lacking explicit offsets during ambiguous repeated local hours (`400 DST_MISSING_EXPLICIT_OFFSET`). With explicit offsets (`+03:00` vs `+02:00`), maps repeated hours to distinct unambiguous UTC instants without collision, allowing sequential bookings on the same workstation.
2. **High-Concurrency Hold Competition Chaos**:
   - 15 concurrent customers simultaneously attempting to acquire atomic holds on the exact same workstation slot.
   - Guaranteed by sorted row locks and PostgreSQL GiST exclusion constraint (`tstzrange` && `[)`): exactly 1 customer secures the hold (`201 CREATED`), and 14 fail with `409 RESOURCE_UNAVAILABLE`. Zero double-bookings.
3. **High-Concurrency Out-Of-Stock Protection (T-015)**:
   - 8 concurrent checkouts for a product with strictly 3 units in stock on hand.
   - Database row-level locks on sorted product IDs serialize reservation: exactly 3 succeed (`201 CREATED`), and 5 fail with `400 INSUFFICIENT_STOCK`. Zero overselling (`stock_reserved == 3`, `stock_on_hand == 3`).
4. **Duplicate Order Handoff Race Protection (T-016)**:
   - Concurrent calls to hand off the same bar pickup order (`POST .../orders/:id/handoff`).
   - Idempotency guard inside locked order transaction returns success without double-decrementing stock.
5. **PSP Webhook Replay & Late Capture Fault Injection**:
   - Duplicate webhook delivery safely deduplicated via `payment_webhook_events` idempotency table (`status: 'IGNORED'`, `duplicate: true`).
   - Expired hold confirmation guard blocks resurrected bookings (`409/410 GONE`).
6. **Concurrent Offline Receipt Void Race (T-030)**:
   - Simultaneous void requests on the same reception receipt: exactly 1 succeeds, secondary request rejected with `409 RECEIPT_ALREADY_VOIDED`. Booking balance credited exactly once.
7. **Crash Simulation & Reconciler Recovery (T-029)**:
   - Simulated crash leaving an orphan captured payment intent: `ReconciliationService.generateDailyReport` flags discrepancy (`DISCREPANCY_FLAGGED`), logs `ORPHAN_INTENT` anomaly, and inserts a `reconciliation_alerts` record.
8. **Connection Pool Starvation Prevention**:
   - Elevated pool connection cap to `max: 30` in `src/db/pool.ts`.
   - Propagated existing client connection to `PaymentsService.createIntent` during checkout transactions, eliminating circular pool wait deadlocks.

## 2. Domain Invariants & Rules
1. **Zero Double-Booking Invariant**:
   - PostgreSQL GiST exclusion constraint on `resource_claims(resource_id, slot)` is mathematically impenetrable under arbitrary concurrency.
2. **Zero Overselling Invariant**:
   - Row-locked inventory deduction prevents reservation beyond `stock_on_hand - stock_reserved`.
3. **DST Invariant**:
   - All booking time boundaries are stored and compared in UTC `[start, end)`. Local wall-clock times that do not exist are rejected; repeated hours must have explicit offsets.
4. **Idempotent Webhooks & Hand-offs**:
   - Secondary deliveries must produce zero side effects on accounting ledgers or physical stock balances.

## 3. Acceptance Verification Plan
Automated integration test suite `tests/eng504-reliability-chaos-dst.spec.ts`:
- **T-025 Spring-Forward**: Proves rejection with `DST_INVALID_LOCAL_TIME`.
- **T-026 Fall-Back**: Proves rejection of missing offset with `DST_MISSING_EXPLICIT_OFFSET` and success with explicit offsets.
- **Resource Concurrency**: Proves 1 winner, 14 `RESOURCE_UNAVAILABLE` under concurrent hold race.
- **T-015 Out-of-Stock**: Proves 3 successes, 5 `INSUFFICIENT_STOCK` errors, zero overselling.
- **T-016 Duplicate Handoff**: Proves single inventory decrement under race.
- **PSP Webhook Replay**: Proves idempotency and rejection of confirmation on expired holds.
- **T-030 Concurrent Void**: Proves 1 winner, 1 `RECEIPT_ALREADY_VOIDED`.
- **T-029 Reconciler Recovery**: Proves orphan capture detection and alerting.
