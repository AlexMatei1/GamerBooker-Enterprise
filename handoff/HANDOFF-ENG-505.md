# HANDOFF-ENG-505: App Store Submission, Legal/Fiscal Sign-Offs, and 1-Venue UAT

## 1. Goal & Architectural Scope
Delivers App Store & Google Play Store submission readiness compliance (Apple Guideline 3.1.3(e) physical services exemption, Google Play Billing policy, in-app account deletion, and demo review kit), Romanian statutory legal and fiscal declarations (OUG 34/2014 Art. 16(l) leisure exception, Law 42/2024 minor protection on energy drinks, and OUG 28/1999 fiscal receipt notice), and a complete automated end-to-end simulation of the proprietor 5-step UAT script for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-505)
- `docs/09-security/02-legal-tax-and-platform-review.md`
- `docs/10-testing/01-test-strategy-and-acceptance.md` (Proprietor UAT Script)

Implements:
1. **App Store & Google Play Submission Readiness Compliance**:
   - `GET /v1/compliance/manifest`:
     - Apple App Review Guideline 3.1.3(e) (Goods and Services Outside of the App): Confirms physical workstation rentals and on-site consumable deliveries are exempt from Apple In-App Purchases (IAP) and use external secure PSP card capture / reception settlement.
     - Google Play Billing Physical Services Exemption.
     - Apple Guideline 5.1.1(v) In-App Account Deletion: Surfaces permanent account deletion (`DELETE /v1/auth`), audit trail logging, and GDPR pseudonymization (`deleted+id@deleted.invalid`).
     - Privacy Nutrition Labels: Declares zero cross-app tracking, zero continuous geolocation tracking, and minimal personal data collection.
   - `GET /v1/compliance/store-review-kit`:
     - Surfaces App Store & Google Play reviewer sandbox credentials (`reviewer.customer@gamerbooker.test`, `reviewer.manager@gamerbooker.test`), test payment cards, and guided walkthrough steps.
2. **Statutory Romanian Legal & Fiscal Disclosures**:
   - OUG 34/2014 Art. 16 alin. (1) lit. l): Formal precontractual disclosure of leisure service exception to the 14-day right of withdrawal.
   - Romanian Law 42/2024: Mandatory statutory ID / age verification disclosures on catalog items and order handoff receipts for energy drinks (`ENERGY_DRINK`) and alcohol (`ALCOHOL`).
   - Romanian OUG 28/1999: Statutory non-fiscal notice on all digital and desk receipts ("Acest document atestă o plată electronică sau recepție și nu substituie bonul fiscal eliberat de casa de marcat").
   - `GET /v1/compliance/venues/:venue_id/fiscal-status`: Validates venue merchant of record readiness (`legal_name`, physical `address`, default policy profile) before public checkout activation.
3. **Proprietor 5-Step Pilot UAT Script Simulation**:
   - **Step 1 (Onboard & Equipment)**: Creates venue with 3 rooms (`Main Arena`, `Console Zone`, `VIP Suite`), 10 PCs (`PC-01` to `PC-10`), 2 consoles (`PS5-01`, `PS5-02`), and private VIP room with 5 interior PCs linked via `resource_components` DAG.
   - **Step 2 (Policies & Pricing)**: Configures 40% deposit, 3h cancellation cutoff, min 60m duration, slot granularity 30m, settlement `ONLINE_OR_RECEPTION`, and multi-tier pricing (3000 bani / h base, 8000 bani / h VIP room).
   - **Step 3 (Publish, Preview, Booking Simulation)**: Publishes layout revision 1, verifies client layout preview (`GET /v1/dashboard/venues/:venue_id/layout/preview`), generates signed price quotes, creates atomic hold, confirms solo booking (`GB-XXXXXX`), and accesses rolling HMAC QR check-in token (`GET /v1/bookings/:id/qr`).
   - **Step 4 (Settlement & Consumables)**: Settles remaining 60% balance at reception desk generating offline cash receipt (`RCP-...`), orders energy drink with Law 42/2024 age flag and snack for bar pickup, tests Crockford pickup code verification, rejects unauthorized handoff without age verification (`400 AGE_VERIFICATION_REQUIRED`), and completes handoff with staff age verification.
   - **Step 5 (Fault Injection & Financial Reconciliation)**: Demonstrates GiST exclusion conflict rejection on overlapping hold (`409 RESOURCE_UNAVAILABLE`), schedules maintenance block on `PS5-01` with availability exclusion, tests inventory stock-out rejection (`400 INSUFFICIENT_STOCK`), executes policy cancellation and partial refund, and verifies daily financial reconciliation report (`GET .../reconciliation/daily`).

## 2. Domain Invariants & Rules
1. **Merchant of Record Integrity**:
   - Each venue operates as an independent Romanian legal entity (SRL) with mandatory `legal_name` and physical address.
2. **Statutory Fiscal Notice Invariant**:
   - Every electronic and reception receipt contains the non-fiscal OUG 28/1999 notice.
3. **Age-Restricted Compliance (Law 42/2024)**:
   - Energy drink orders cannot transition to `HANDED_OFF` without explicit staff age verification audit stamps.
4. **App Store Guideline 3.1.3(e) Exemption**:
   - Real-world physical services and on-site consumption bypass In-App Purchases.

## 3. API Specification
- `GET /v1/compliance/manifest` (Store review & Romanian statutory compliance manifest)
- `GET /v1/compliance/store-review-kit` (Reviewer credentials, test cards, guided steps)
- `GET /v1/compliance/venues/:venue_id/fiscal-status` (Merchant of record readiness check)

## 4. Acceptance Verification Plan
Automated integration test suite `tests/eng505-app-store-legal-and-uat.spec.ts`:
- **App Store Manifest**: Proves Apple 3.1.3(e), Google Play, and account deletion compliance.
- **Review Kit**: Proves availability of reviewer test credentials and test cards.
- **Legal/Fiscal Manifest**: Proves OUG 34/2014, Law 42/2024, and OUG 28/1999 declarations.
- **Venue Fiscal Readiness**: Proves validation of tenant legal name and physical address.
- **5-Step UAT Script**: Proves complete end-to-end walkthrough from multi-room setup through booking, reception cash balance payment, age-verified consumables handoff, fault injection, and daily reconciliation report.
