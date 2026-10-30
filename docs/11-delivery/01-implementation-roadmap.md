# Roadmap de implementare și milestones

Acest roadmap este un **plan recomandat**, nu un calendar contractual sau o estimare de durată. Implementarea se face incremental, cu vertical slices complete și demos E2E.

## Milestone M0 — Foundations
- Repo structure, CI/CD, environments, auth, tenant & venue model, migrations, secrets, logs, audit, rate limits.
- Contract-first API, schema validation, test automation, staging PSP sandbox.
- Exit: multi-tenant isolation tests, health checks, reproducible deploy, backup restore demo.

## M1 — Resource & availability core
- Venue/room/zone/resource types; schedule, policy, pricing, claims exclusion, hold TTL.
- Quote server-side, solo booking, payment full/deposit, webhook, QR booking detail.
- Exit: concurrency tests no double booking, solo checkout E2E.

## M2 — Venue Control Center core
- Owner onboarding, resource catalog, schedules, policy/price hierarchy, staff roles.
- Map read view + check-in desk, book status, offline receipt recording, audit.
- Exit: venue setup end-to-end and venue pilot can operate without developer interventions.

## M3 — Visual Layout Builder complete V1
- 2D canvas free draw, walls/doors/furniture, multi-room, resource nodes, private-room topology, bulk editing/templates.
- Draft/preview/publish/version history; customer floor map with selection.
- Exit: non-developer owner draws and publishes real floor; no broken bookings after edits.

## M4 — Groups and split-pay
- Group organizer/split, participant invite/payment, hold expiry/reconciliation/refund, pay remaining online or reception.
- Exit: 5 PC group paid separately/organizer, failure/refund cases E2E.

## M5 — Consumables
- Menu and stock, order cart/payment, preorders and during-session, bar board, pickup/station handoff, product restrictions.
- Exit: stock race tests, order/refund financial consistency.

## M6 — Polish, reschedule, reliability
- Modify/cancel/extend, push notifications, support flows, analytics, accessibility, performance and security hardening.
- Exit: P0 test matrix, legal/fiscal sign-off, app store approval checklist.

## M7 — Pilot + GA
- 1 gaming venue reală cu PC și console (și private room dacă disponibilă); test weekly operations; incident feedback.
- Reconcile refunds, offline payment, online PSP, occupancy, booking conflicts, order handoff.
- Decide launch on metrics and risk assessment; only then expand partners.

## Interdependencies
- Layout depends on Resource IDs and topology, not vice versa.
- Split-pay depends on PSP/webhooks/ledger/holds and cancellation.
- Consumables depend on booking eligibility, inventory, order payment and staff board.
- Refunds and legal policies need before live paid pilot, nu după.

## Backlog format
Each story has: ID, product outcome, priority, dependencies, API/data changes, UX, failure cases, telemetry, acceptance tests, owner, status. Unblocking P0 defects takes precedence over feature cosmetics.
