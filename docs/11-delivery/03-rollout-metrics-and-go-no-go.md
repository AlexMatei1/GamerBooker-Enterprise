# Pilot plan, product analytics și go/no-go

## Pilot design [PROPOSED]
- Initial: o sală cu cel puțin 10 PC și o zonă console; echipă staff instruită.
- Configurație: 40% example deposit, anulare 3h, minim 60 min, rest online/recepție, live consumables and private room dacă disponibilă.
- Testăm app-only self-booking inclusiv la recepție cu utilizatori noi: friction, install-to-book conversion, support need.

## Metric definitions
| KPI | Numerator/denominator | Goal baseline |
|---|---|---|
| Booking conversion | confirmed / checkout sessions | establish baseline |
| Time to first booking | median install/signup→confirmed | reduce with iterations |
| Double booking | confirmed overlaps / confirmed bookings | exactly 0 |
| Payment mismatch | unreconciled provider/offline entries | 0 unresolved per closing day |
| Split success | all-paid split bookings / split checkout started | baseline, monitor expired refunds |
| No-show | no-show sessions / confirmed started | benchmark vs historic venue |
| Menu attachment | sessions with paid order / completed sessions | monitor revenue lift |
| QR success | valid first scans / check-in attempts | >= 99% [PROPOSED] |
| Layout onboarding | median hours configuring first venue | record & improve |
| Staff time | median seconds per check-in/handoff | reduce with pilot |

## Go/no-go
- All critical tests green (`10-testing/01-test-strategy-and-acceptance.md`).
- No confirmed double bookings, no financial balances unexplained after reconciliation.
- PSP webhooks + partial captures + refunds demonstrated; offline receipts accounted.
- Legal/fiscal privacy and mobile store submissions approved.
- Layout draft/publish stable, editor performance acceptable for real venue.
- User can install app from on-site QR and reserve without staff creating a booking.
- Venue staff can deliver consumables and reconcile order totals.

## Product decisions after pilot
- Whether split payment success improves group bookings enough to justify complexity.
- Whether compulsory app installation materially hurts walk-in conversion (scope change only by explicit owner decision).
- Whether setup editor needs CAD-like import or templates are enough.
- Whether loyalty/promos are valuable; no automatic feature expansion to social.

## Post-launch
Monitor 30/60/90-day cohorts and incidents, expand venues gradually, schedule SLA reviews, run weekly fraud/refund review, and quarterly permission audits.
