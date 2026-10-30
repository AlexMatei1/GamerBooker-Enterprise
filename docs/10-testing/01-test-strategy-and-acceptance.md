# Test strategy, quality gates și UAT

## Niveluri
1. Unit: pricing/deposit rounding, policy inheritance, intervals, resource topology, ledger totals, API validators.
2. Integration DB: exclusion constraints, concurrent hold updates, group checkout, stock contention, receipt double capture.
3. Contract: OpenAPI schema, payment adapter, PSP webhook signatures, outbox versioning.
4. E2E client + dashboard: install/deep link, quote, pay, QR, order, balance, cancel, reschedule, private room, layout publish.
5. Security: RBAC/ABAC, BOLA, malicious price edit, replay attacks, QR tamper, upload restrictions.
6. Load/fault: peak search, 100 simultaneous claims, PSP offline/late webhook, DB restart, cache failure.
7. Accessibility and device matrix: iOS/Android supported versions, screen reader, large text, desktop browser/editor.
8. UAT: proprietar, recepționer, bar staff și clienți într-o sală pilot reală.

## P0 test cases
| ID | Scenario | Expected | Domain |
|---|---|---|---|
| T-001 | Two users hold same PC same slot | Exactly one hold | Availability |
| T-002 | Private room vs child PC overlapping | Exactly one confirmed | Availability |
| T-003 | Adjacent slots [18,19) and [19,20) | Both possible | Availability |
| T-004 | Hold expiry after split 4/5 paid | No booking + refund all 4 | Payments |
| T-005 | Duplicate PSP webhook | One capture ledger entry | Payments |
| T-006 | PSP success after hold expired | Refund task, no booking | Payments |
| T-007 | Solo booking 40% deposit | One payer 40% due-now | Pricing |
| T-008 | Group 5 full prepaid | Sum of shares equals total | Group |
| T-009 | Offline receipt and PSP race | No over-credit; deterministic result | Payments |
| T-010 | Policy change after confirm | Booking retains snapshot | Policies |
| T-011 | Change venue policy for VIP only | Correct overrides | Config |
| T-012 | Publish free-form multi-room map | Customer sees correct rooms | Layout |
| T-013 | Remove resource with future booking | Publish blocked | Layout |
| T-014 | Move visual object only | Booking references unchanged | Layout |
| T-015 | Out of stock product concurrent | <= quantity sold | Orders |
| T-016 | Order handoff duplicated | Single stock decrement | Orders |
| T-017 | Receive booking QR for other venue | Check-in denied | Security |
| T-018 | Cross-tenant resource ID in API | Access denied | Security |
| T-019 | Client changes due_now in request | Server ignores/rejects | Payments |
| T-020 | User walks in without booking | Self-app booking, no staff create | UX |
| T-021 | Balance reception-only venue | Online remaining payment option absent | UX |
| T-022 | Balance online-only venue | Staff cannot falsely record cash route | Permissions |
| T-023 | Cancel 4h before 3h cutoff | Full eligible refund | Cancels |
| T-024 | Cancel 2h before 3h cutoff | Snapshot penalty displayed/applied | Cancels |
| T-025 | DST forward missing local hour | UI blocks invalid slot | Time |
| T-026 | DST backward duplicate hour | Explicit offsets and stable UTC | Time |
| T-027 | Restricted energy drink minor | Cannot complete unauthorized handoff | Compliance |
| T-028 | Staff no create booking access | API 403/404 | Authorization |
| T-029 | App server crash after PSP capture | Reconciler resolves without double booking | Reliability |
| T-030 | Offline receipt duplicate reference | No duplicate receivable credit | Payments |

## Gherkin sample
```gherkin
Feature: Room exclusivity
  Scenario: Private room is not double-booked with a child PC
    Given private room "VIP-1" contains "PC-1" and "PC-2"
    And a booking holds "PC-2" from 20:00 to 22:00
    When another customer attempts to hold "VIP-1" from 21:00 to 22:00
    Then the API returns RESOURCE_UNAVAILABLE
    And no money is captured for the failed room hold
```

## UAT script proprietar
1. Onboard venue, free-draw 3 camere; configure 10 PC, 2 console și private room cu 5 PC-uri.
2. Configure deposit 40%, cancel free 3h, min 60m, rest online și recepție.
3. Publish layout, preview client, simulate booking individual și grup.
4. Confirm split-pay și recepție balance; plasează consumabile la stație și la bar.
5. Fault injection: ocupare conflict, PC maintenance, stock-out, refund, policy publish. Review audit și rapoarte.

## Test gates
- All P0 green; zero unresolved Severity-1/2; financial ledger balances and PSP reconciliation verified; test data isolated.
- Chaos/game-day PSP failure și duplicate webhook pass; 0 overlap under 100-way concurrency.
- Staff/owner can complete core tasks without team engineering intervention; no bugs care permit staff booking creation.
- Legal review gates signed off; platform policies current at submission.
