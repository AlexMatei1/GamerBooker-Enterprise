# HANDOFF-ENG-506: Incident Runbooks R1-R6, Partner Training Certifications, and Pilot Launch Decision Engine

## 1. Goal & Architectural Scope
Describes operational and pilot features for GamerBooker Enterprise v1.0. Current assessment and verification limits are in the [handoff status index](HANDOFF-INDEX-2026-11-04.md). Sources:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-506)
- [`docs/11-delivery/02-operations-and-runbooks.md`](../docs/11-delivery/02-operations-and-runbooks.md) (runbooks R1–R6)
- [`docs/11-delivery/03-rollout-metrics-and-go-no-go.md`](../docs/11-delivery/03-rollout-metrics-and-go-no-go.md) (pilot KPIs and release criteria)

The four-module training curriculum and certification workflow below are ENG-506 design and implementation details in [`src/operations/runbooks.service.ts`](../src/operations/runbooks.service.ts) and [`runbooks.controller.ts`](../src/operations/runbooks.controller.ts); no separate curriculum document has been identified.

Implements:
1. **Operational Incident Runbooks (R1 - R6)**:
   - **R1 (Double-Booking Allegation Audit)**: `GET /v1/runbooks/r1-double-booking-audit?resource_id=...&from=...&to=...`
     - Evaluates PostgreSQL GiST exclusion claims for overlapping time slots.
     - Distinguishes physical station squatting (zero database overlap, 1 legitimate active booking) from structural database overlap.
     - Provides clear remediation guidance for on-floor staff.
   - **R2 (Orphan PSP Payment Resolution)**: `POST /v1/runbooks/r2-orphan-payment-resolution`
     - Identifies payment intents in status `CAPTURED` without a linked booking (`booking_id IS NULL` and `group_booking_id IS NULL`).
     - Issues an automated compensating refund through `RefundsService.requestRefund` or flags state for manual ledger reconciliation.
   - **R3 (Receivable Mismatch Daily Audit)**: `GET /v1/runbooks/r3-receivable-reconciliation?venue_id=...&date=YYYY-MM-DD`
     - Reconciles total booked value against total captured collections (online card payments + reception cash receipts + reception POS card receipts minus voided receipts).
     - Emits balanced delta status within rounding tolerance (±100 bani / 1 RON).
   - **R4 (Venue Layout Publish Pre-Flight Diagnostics)**: `GET /v1/runbooks/r4-publish-diagnostics?venue_id=...`
     - Runs 5-gate pre-publication checks: initialized layout draft, default pricing rules (`VENUE_DEFAULT`), default policy profile, complete 7-day operating schedule, and active bookable resources.
     - Reports exact equipment counts (`total_resources`, `bookable_resources`, `rooms_count`, `zones_count`).
   - **R5 (Offline Check-In Contingency Protocol)**: `GET /v1/runbooks/r5-offline-checkin-contingency`
     - Enforces the strict platform invariant: **NO STAFF BYPASS** of customer app-based bookings.
     - Directs reception staff to verify booking references, validate Crockford tokens, and record offline receipts without taking unauthorized out-of-band cash for unreserved inventory.
   - **R6 (Product Out-of-Stock Emergency Action)**: `POST /v1/runbooks/r6-out-of-stock-action`
     - Immediately deactivates product SKU in catalog (`active = false`).
     - Identifies all pending orders containing the SKU (`PAYMENT_PENDING`, `PLACED`, `ACCEPTED`, `PREPARING`), transitions items to `REFUNDED_UNAVAILABLE`, and tracks total refunded amounts.
2. **Partner Training Program & Staff Certifications**:
   - `GET /v1/training/curriculum`: Surfaces four modules: `OWNER_GOVERNANCE`, `MANAGER_OPERATIONS`, `RECEPTION_ZERO_STAFF_BOOKING`, and `BAR_LAW_42_2024_AGE_COMPLIANCE`.
   - `POST /v1/training/certify`: Manager/Owner certifies staff members upon passing assessment (stores certified score and date).
   - `GET /v1/training/venues/:venue_id/readiness`: Computes venue operational readiness percentage and lists any missing role-specific certifications.
3. **Pilot Launch KPIs and Go/No-Go Decision Engine**:
   - `GET /v1/dashboard/venues/:venue_id/pilot-metrics`: Derives booking/hold conversion, no-show rate, menu attachment, booking count, and the sum of booking totals labeled revenue from database queries. The implementation returns fixed values for double-booking rate (0), unresolved mismatches (0), split success (100), QR success (100), and median staff intake (4). These constants do not measure actual outcomes and are gaps; the QR query does not change the returned constant.
   - `GET /v1/dashboard/venues/:venue_id/go-no-go`: Evaluates seven checks: publication, active layout, available bookable equipment, overlapping active claims, flagged reconciliation reports, staff training, and a default policy profile. The overlap query is database-wide, and absence of flagged reports does not establish that reconciliation is complete. Its `GO` or `NO_GO` is limited to these checks and is not the complete launch decision.

The canonical release criteria also require critical tests, financial reconciliation and demonstrated payment/refund flows, legal/fiscal/privacy and store approvals, and real venue operational validation. A `GO` from the endpoint does not establish those conditions or grant launch approval.

## 2. Database Schema Extensions
- `migrations/0032_runbooks_and_training.sql`:
  - `staff_certifications`: Tracks staff member certification records with unique constraint `(user_id, venue_id, module_id)`, certification scores, timestamps, and certified-by foreign keys.
  - Granted `SELECT, INSERT, UPDATE, DELETE` to least-privilege `gamerbooker_app` role.

## 3. Domain Invariants & Rules
1. **Double-Booking Physical Squatting Invariant**:
   - The GiST exclusion constraint is intended to prevent overlapping active claims on the same resource. R1 investigates claims and physical occupancy; an allegation must not automatically be diagnosed as squatting.
2. **Strict App-Only Contingency Invariant**:
   - Staff cannot manually construct out-of-band bookings during network degradation; all bookings must originate through signed client app holds and bookings.
3. **Orphan Payment Protection**:
   - Every captured payment intent lacking booking associations can be compensated via idempotent refund.
4. **Go/No-Go Gate Rigor**:
   - The endpoint evaluates its 7 operational checks. Full launch acceptance also requires the canonical release criteria above.

## 4. API Endpoints
- `GET /v1/runbooks/r1-double-booking-audit`
- `POST /v1/runbooks/r2-orphan-payment-resolution`
- `GET /v1/runbooks/r3-receivable-reconciliation`
- `GET /v1/runbooks/r4-publish-diagnostics`
- `GET /v1/runbooks/r5-offline-checkin-contingency`
- `POST /v1/runbooks/r6-out-of-stock-action`
- `GET /v1/training/curriculum`
- `POST /v1/training/certify`
- `GET /v1/training/venues/:venue_id/readiness`
- `GET /v1/dashboard/venues/:venue_id/pilot-metrics`
- `GET /v1/dashboard/venues/:venue_id/go-no-go`

## 5. Acceptance Verification Plan
The existing automated integration test file [`tests/eng506-runbooks-training-and-pilot.spec.ts`](../tests/eng506-runbooks-training-and-pilot.spec.ts) describes coverage of runbook behavior, training and certifications, pilot metrics, and the endpoint's checks. The file's presence does not verify those behaviors or the complete release criteria. Tests were not run in this documentation review; verify the relevant cases and the measurement gaps above before relying on the results.
