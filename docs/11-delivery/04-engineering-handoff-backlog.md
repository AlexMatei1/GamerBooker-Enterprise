# Engineering handoff — backlog pe epicuri și ordinea de implementare

## Task format obligatoriu
`ID | Goal | Inputs | Domain invariant | API | DB | UI | Error codes | Authorization | Tests | Telemetry | Acceptance owner`.

## E0 Foundation
- `ENG-001` Init repo/CI IaC staging/prod, secrets/observability.
- `ENG-002` Auth mobile & venue dashboard: verified identity, MFA staff, sessions and RBAC.
- `ENG-003` Multi-tenant venue schema, memberships, admin onboarding, row ownership tests.
- `ENG-004` Migrations, fixture seeds, SQL time range / exclusions.
- `ENG-005` PSP integration contract + sandbox and webhook replay harness.

## E1 Bookings
- `ENG-101` Resource types, schedule and exception calendar.
- `ENG-102` Policy hierarchy + validator + snapshot.
- `ENG-103` Price quote with minor-unit exact arithmetic and expiry.
- `ENG-104` Atomic hold + private room component closure + expiry worker.
- `ENG-105` Booking confirmation guard and state machine with audit/outbox.
- `ENG-106` Solo checkout (FULL and DEPOSIT), QR, balance display.
- `ENG-107` Client cancel/modify/extend and compensating workflows.

## E2 Venue Dashboard + Layout
- `ENG-201` Venue setup wizard, staff invitation and permissions.
- `ENG-202` Resource CRUD and bulk clone/import.
- `ENG-203` Free-form geometry scene/editor layers tools, multi-room.
- `ENG-204` Resource inspector, adjacency edges, private room composition editing.
- `ENG-205` Draft/revision/publish/preview validation and rollback.
- `ENG-206` Live floor and calendar, check-in scanner, maintenance blocks.
- `ENG-207` Pricing/policies UI with customer preview and clear examples.

## E3 Group / Payments
- `ENG-301` Split allocation + invitation tokens (booking-only logistics).
- `ENG-302` Per-payer PSP intent, completion checks, timeout compensation.
- `ENG-303` Organizer-pay-all and pay-difference safety.
- `ENG-304` Online remaining payment, reception offline receipt ledger + permissions.
- `ENG-305` Refund lifecycle, daily reconciliation report and alerting.

## E4 Orders
- `ENG-401` Product/menu category, image upload, pricing/stock.
- `ENG-402` Cart and checkout, preorders and session order eligibility.
- `ENG-403` Bar board state machine, handoff station/pickup.
- `ENG-404` Age restrictions, refund unavailable products and stock reconciliation.
- `ENG-405` Booking packages with atomic availability and stock validation.

## E5 Launch
- `ENG-501` Notifications/templates/receipt/status flows.
- `ENG-502` Customer accessibility + deep links + mandatory mobile app install funnel.
- `ENG-503` Security hardening, BOLA/PenTest, observability dashboards.
- `ENG-504` End-to-end reliability, chaos PSP/refund/concurrency, DST tests.
- `ENG-505` App store submission, legal/fiscal sign-offs, 1-venue UAT.
- `ENG-506` Incident runbooks, partner training, pilot metrics.

## Critical path
`ENG-001..005 → ENG-101..106 → ENG-201/202/206 → ENG-203..205 → ENG-301..305 + ENG-401..404 → ENG-501..506`.

## Do not shortcut
- Nu dați create booking direct din dashboard staff.
- Nu lăsați frontend să seteze sumă de plată; toate quote-urile sunt semnate/valuate pe server.
- Nu țineți exclusivitatea în cache în loc de DB claim.
- Nu confirmați grupuri cu plăți parțiale insuficiente.
- Nu publicați layout-uri care șterg resurse cu rezervări viitoare.
- Nu lansați fără verificare fiscală și PSP.
