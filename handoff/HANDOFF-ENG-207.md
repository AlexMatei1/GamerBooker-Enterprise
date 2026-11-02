# HANDOFF-ENG-207: Pricing & Policies UI with Customer Preview and Clear Examples

## 1. Goal & Architectural Scope
Delivers the pricing & policies administrative engine with customer preview estimates, realistic duration scenarios, resource rate comparisons, and clear Romanian customer disclosures for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-207)
- `docs/05-venue-dashboard/03-config-pricing-policy-engine.md` (Admin Control & Examples)

Implements:
1. **Realistic Customer Estimate Scenarios**:
   - `GET /v1/dashboard/venues/:venue_id/policies/preview-estimates`
   - Computes penny-accurate financial totals across 4 standard booking scenarios:
     - `solo_1h`: 1-hour solo session (total, due-now deposit, remaining balance, cancellation cutoff).
     - `solo_2h`: 2-hour solo session.
     - `solo_3h`: 3-hour extended solo session.
     - `group_5p_2h`: 5-player group session (2 hours) calculating total group price, group deposit due now, per-player equal share (`60.00 RON`), and per-player deposit (`24.00 RON`).
   - Surfaces human-readable Romanian formatted strings (`30.00 RON`, `12.00 RON`, etc.) and plain-language policy explanations.
2. **Resource-Level Rate Hierarchy & Audit Diff**:
   - Compares every resource in the venue against the venue default rate.
   - Accurately tracks pricing source (`RESOURCE`, `ZONE`, `VENUE_DEFAULT`) and policy source (`RESOURCE_OVERRIDE`, `ZONE_POLICY`, `VENUE_DEFAULT`).
   - Computes exact rate deltas (`diff_from_venue_default_minor`) enabling proprietors to audit pricing variations before publishing.
3. **Real-Time Draft Policy Simulation**:
   - `POST /v1/dashboard/venues/:venue_id/policies/preview-estimates`
   - Allows managers to simulate custom draft policies (e.g. 60% deposit, 6h free cancellation, `ONLINE_ONLY` settlement) without committing changes to the database.
   - Emits recalculated scenario due-now and balance values in real time.
4. **Customer Policy Disclosures & Statutory Texts**:
   - Free cancellation disclosure explaining hours and penalty percentages.
   - Deposit disclosure explaining online vs reception settlement options.
   - Statutory Romanian legal notices: OUG 34/2014 Art. 16(l) leisure exception and OUG 28/1999 receipt notice.
5. **Security & RBAC Enforcement**:
   - Reception staff granted read-only preview access.
   - Owner / Venue Manager granted mutation simulation permissions.
   - Customers prohibited from viewing venue administrative preview tools (returns `404 RESOURCE_NOT_FOUND` under the non-enumeration invariant).
   - Unauthenticated requests rejected with `401 AUTH_REQUIRED`.

## 2. API Endpoints
- `GET /v1/dashboard/venues/:venue_id/policies/preview-estimates` (preview effective policy and pricing rules)
- `POST /v1/dashboard/venues/:venue_id/policies/preview-estimates` (simulate draft policy changes in real time)

## 3. Acceptance Verification Plan
Automated integration test suite `tests/eng207-pricing-policies-preview.spec.ts`:
- Proves 4 realistic scenario calculations (1h, 2h, 3h, 5-seat group) with penny-accurate totals, due-now deposits, and balances.
- Proves resource-specific pricing resolution for VIP zone workstations (+20.00 RON delta).
- Proves resource inventory comparison table showing source levels and rate deltas.
- Proves real-time draft policy simulation via POST without mutating stored database state.
- Proves RBAC boundaries (Reception read-only, Customer 404 non-enumeration guard, Unauthenticated 401).
