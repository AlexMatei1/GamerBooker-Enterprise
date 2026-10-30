# Test data, fixtures, fault injection

## Standard test venues
- `VENUE-A`: 2 rooms, Standard 10 PC, VIP 5 PC private room, console room with 2 PS5 setups; deposit 40%, cancel 3h, min 60min, remaining online+reception.
- `VENUE-B`: 1 room, 10 PC, full prepaid, pickup only, cancellability 6h; distinct tenant.
- `VENUE-C`: 3 rooms, mixed policies, VIP 50% and minimum 120min, platform pilot account.

## Fixtures
- Normal booking PC-A1 18:00–20:00, total 10000 bani, deposit 4000 bani.
- Group 5 seat booking, full 20000 bani, due now 8000 bani, shares 1600 bani ×5.
- Private room R1 contains PC-A1..A5; no overlapping active child booking permitted.
- Console setup S1 capacity 4 with 4 controllers; 2/3/4 guests allowed, 5 refused.
- Products water 500 bani qty 2, energy drink 1200 bani qty 1 restricted, pizza 2800 bani qty 0.

## Failure simulation matrix
| Failure | Injection | Assertion |
|---|---|---|
| PSP timeout | Stop provider response after intent created | Pending state reconciled, no duplicate intent |
| Webhook duplicate | Deliver same event 10x | One payment/ledger capture |
| Webhook out of order | success then failure event | Monotonic state / provider verify |
| DB connection lost | Kill connection during hold | Transaction rollback or safe retry |
| Worker down | Stop expiry worker 30m | On-demand cleanup prevents ghost holds |
| Sudden pricing update | Publish during checkout | Quote expiry/version rules enforced |
| Reschedule payment failure | PSP declines delta | Original booking survives |
| Concurrent private room requests | 50 room and 50 child bookings | No overlapping claims |
| Order stock race | 10 clients buy qty 1 | 1 success, no oversell |
| Tenant ID tamper | venue B booking id from venue A | denied, no PII leakage |
| QR replay | reuse scanned token | `ALREADY_CHECKED_IN`, no duplicate |
| Layout publish race | 2 owners publish from same revision | one commit, other version conflict |

## Property-based tests
- For all valid bookings `remaining + paid + recognized_credit - refunds_adjusted = contractual_obligation` under defined ledger semantics.
- Claims atom sets pairwise nonoverlapping for same resource across active intervals.
- Group shares sum to due-now for all participant counts 1..20 and random bani totals.
- Back-to-back intervals do not conflict at common endpoint.
- Idempotent repeat commands preserve immutable result after first successful commit.

## Data handling
Use synthetic users/venues in all environments. Test payment mode/provider sandbox only; no real card PAN. Purge synthetic PII per test retention policy. Load tests prefer staging isolated from production.
