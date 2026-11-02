# HANDOFF-ENG-506: Incident Runbooks R1-R6, Partner Training Certifications, and Pilot Launch Decision Engine

## 1. Goal & Architectural Scope
Delivers operational excellence and pilot launch governance for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-506)
- `docs/08-operations/01-incident-runbooks.md` (Runbooks R1 - R6)
- `docs/08-operations/02-partner-training-curriculum.md` (Curriculum & Certifications)
- `docs/08-operations/03-pilot-rollout-and-kpis.md` (Pilot KPIs & Go/No-Go Decision Engine)

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
   - `GET /v1/training/curriculum`: Surfaces official 6-module curriculum (`MOD-001` Platform Fundamentals, `MOD-002` Floor Management & Layout, `MOD-003` Reception Operations & Check-In, `MOD-004` Bar Operations & F&B SLAs, `MOD-005` Financial Ledger & Reconciliation, `MOD-006` Incident Runbooks & Escalation).
   - `POST /v1/training/certify`: Manager/Owner certifies staff members upon passing assessment (stores certified score and date).
   - `GET /v1/training/venues/:venue_id/readiness`: Computes venue operational readiness percentage and lists any missing role-specific certifications.
3. **Pilot Launch KPIs and Go/No-Go Decision Engine**:
   - `GET /v1/dashboard/venues/:venue_id/pilot-metrics`: Queries production database tables to compute live KPIs (booking conversion rate, double-booking rate strictly 0.0%, unresolved payment mismatches, split payment success rate, no-show rate, menu attachment rate, and QR check-in success rate).
   - `GET /v1/dashboard/venues/:venue_id/go-no-go`: Evaluates all 7 launch readiness gates (Publication Status, Active Layout Revision, Available Bookable Resources, 7-Day Operating Schedules, Default Cancellation/Deposit Policy, Base Pricing Rule, and 100% Staff Training Certification). Computes overall `DECISION: GO` or `NO_GO`.

## 2. Database Schema Extensions
- `migrations/0032_runbooks_and_training.sql`:
  - `staff_certifications`: Tracks staff member certification records with unique constraint `(user_id, venue_id, module_id)`, certification scores, timestamps, and certified-by foreign keys.
  - Granted `SELECT, INSERT, UPDATE, DELETE` to least-privilege `gamerbooker_app` role.

## 3. Domain Invariants & Rules
1. **Double-Booking Physical Squatting Invariant**:
   - PostgreSQL GiST exclusion constraint (`tsrange` overlap) physically prevents multiple overlapping confirmed claims on the same resource. Runbook R1 formally diagnoses customer complaints as physical squatting rather than system overlap.
2. **Strict App-Only Contingency Invariant**:
   - Staff cannot manually construct out-of-band bookings during network degradation; all bookings must originate through signed client app holds and bookings.
3. **Orphan Payment Protection**:
   - Every captured payment intent lacking booking associations can be compensated via idempotent refund.
4. **Go/No-Go Gate Rigor**:
   - Launch requires all 7 operational gates to pass simultaneously with zero blocking violations.

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
Automated integration test suite `tests/eng506-runbooks-training-and-pilot.spec.ts`:
- Proves Runbook R1 audits double-booking allegation and identifies physical squatting.
- Proves Runbook R2 resolves orphan captured PSP payment with compensating refund.
- Proves Runbook R3 reconciles daily receivables against online + offline collections.
- Proves Runbook R4 diagnoses venue publish readiness and counts resources.
- Proves Runbook R5 surfaces strict app-only contingency protocols.
- Proves Runbook R6 deactivates out-of-stock SKU and refunds pending order items.
- Proves curriculum delivery and staff role certification tracking.
- Proves pilot live KPI computation from real database tables.
- Proves evaluation of all 7 Go/No-Go release gates.
