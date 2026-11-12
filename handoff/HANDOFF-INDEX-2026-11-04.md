# Engineering handoff status — 2026-11-04

This is a documentation inventory, not a general test report or acceptance decision. Every item below links to its handoff and a concrete source or test artifact. Presence of an artifact does not prove it works, satisfies every requirement, or is production-ready. The initial inventory ran no tests; the later focused ENG-004 run is recorded separately below. Historical test claims in [CHANGELOG](../CHANGELOG.md) and verification notes remain historical.

**Present, unverified** means a relevant implementation or test artifact exists, with no fresh assessment here. **Partial, acceptance open** identifies an explicit remaining acceptance or external approval gap. Historical “proposed” status lines in earlier handoffs describe the time they were written; use this index for this dated inventory. Unreviewed handoff descriptions may differ from the current code and require reconciliation before implementation or acceptance.

| Backlog | Handoff | Evidence located | Assessment |
|---|---|---|---|
| ENG-001 | [Foundation](HANDOFF-ENG-001.md) | [verification note](../notes/eng-001-verification.md) | Partial, acceptance open; the historical note lists foundation gaps |
| ENG-002 | [Auth](HANDOFF-ENG-002.md) | [auth verification note](../notes/eng-002-slice-b-part-2-verification.md) | Partial, acceptance open; staging/prod verification delivery and key management blockers remain documented |
| ENG-003 | [Tenancy](HANDOFF-ENG-003.md) | [test artifact](../tests/eng003-multi-tenant-venues.spec.ts) | Present, unverified |
| ENG-004 | [Migrations and claims](HANDOFF-ENG-004.md) | [focused verification](../notes/eng-004-verification-2026-11-04.md) | Focused verification passed; broader acceptance open |
| ENG-005 | [PSP contract](HANDOFF-ENG-005.md) | [test artifact](../tests/eng005-psp-integration.spec.ts) | Present, unverified |
| ENG-101 | [Schedules](HANDOFF-ENG-101.md) | [test artifact](../tests/eng101-schedules-and-availability.spec.ts) | Present, unverified |
| ENG-102 | [Policies](HANDOFF-ENG-102.md) | [test artifact](../tests/eng102-policy-hierarchy.spec.ts) | Present, unverified |
| ENG-103 | [Quotes](HANDOFF-ENG-103.md) | [test artifact](../tests/eng103-price-quotes.spec.ts) | Present, unverified |
| ENG-104 | [Holds](HANDOFF-ENG-104.md) | [test artifact](../tests/eng104-atomic-holds.spec.ts) | Present, unverified |
| ENG-105 | [Booking confirmation](HANDOFF-ENG-105.md) | [test artifact](../tests/eng105-booking-confirmation.spec.ts) | Present, unverified |
| ENG-106 | [Solo checkout](HANDOFF-ENG-106.md) | [test artifact](../tests/eng106-solo-checkout-and-qr.spec.ts) | Present, unverified |
| ENG-107 | [Lifecycle](HANDOFF-ENG-107.md) | [test artifact](../tests/eng107-compensating-lifecycle.spec.ts) | Present, unverified |
| ENG-201 | [Setup and staff](HANDOFF-ENG-201.md) | [test artifact](../tests/eng201-venue-setup-and-staff.spec.ts) | Present, unverified |
| ENG-202 | [Resources](HANDOFF-ENG-202.md) | [test artifact](../tests/eng202-resource-crud-and-bulk.spec.ts) | Present, unverified |
| ENG-203 | [Layout scene](HANDOFF-ENG-203.md) | [test artifact](../tests/eng203-layout-scene-and-layers.spec.ts) | Present, unverified |
| ENG-204 | [Resource inspector](HANDOFF-ENG-204.md) | [test artifact](../tests/eng204-resource-inspector-and-adjacencies.spec.ts) | Present, unverified |
| ENG-205 | [Layout publication](HANDOFF-ENG-205.md) | [test artifact](../tests/eng205-layout-publish-and-rollback.spec.ts) | Present, unverified |
| ENG-206 | [Live floor](HANDOFF-ENG-206.md) | [test artifact](../tests/eng206-live-floor-and-calendar.spec.ts) | Present, unverified |
| ENG-207 | [Pricing preview](HANDOFF-ENG-207.md) | [test artifact](../tests/eng207-pricing-policies-preview.spec.ts) | Present, unverified |
| ENG-301 | [Group allocation](HANDOFF-ENG-301.md) | [test artifact](../tests/eng301-group-split-allocation.spec.ts) | Present, unverified |
| ENG-302 | [Group payments](HANDOFF-ENG-302.md) | [test artifact](../tests/eng302-group-payments-and-timeout.spec.ts) | Present, unverified |
| ENG-303 | [Organizer payments](HANDOFF-ENG-303.md) | [test artifact](../tests/eng303-organizer-pay-difference.spec.ts) | Present, unverified |
| ENG-304 | [Balance and receipts](HANDOFF-ENG-304.md) | [test artifact](../tests/eng304-online-balance-and-receipt-ledger.spec.ts) | Present, unverified |
| ENG-305 | [Refunds and reconciliation](HANDOFF-ENG-305.md) | [test artifact](../tests/eng305-refund-lifecycle-and-reconciliation.spec.ts) | Present, unverified |
| ENG-401 | [Catalog and stock](HANDOFF-ENG-401.md) | [test artifact](../tests/eng401-menu-catalog-and-stock.spec.ts) | Present, unverified |
| ENG-402 | [Cart and checkout](HANDOFF-ENG-402.md) | [test artifact](../tests/eng402-cart-checkout-and-preorders.spec.ts) | Present, unverified |
| ENG-403 | [Bar board](HANDOFF-ENG-403.md) | [test artifact](../tests/eng403-bar-board-and-handoff.spec.ts) | Present, unverified |
| ENG-404 | [Restrictions and refunds](HANDOFF-ENG-404.md) | [test artifact](../tests/eng404-age-refusal-item-refunds-and-stock-reconciliation.spec.ts) | Present, unverified |
| ENG-405 | [Packages](HANDOFF-ENG-405.md) | [test artifact](../tests/eng405-booking-packages.spec.ts) | Present, unverified |
| ENG-501 | [Notifications](HANDOFF-ENG-501.md) | [test artifact](../tests/eng501-notifications-and-receipts.spec.ts) | Present, unverified |
| ENG-502 | [Accessibility and links](HANDOFF-ENG-502.md) | [test artifact](../tests/eng502-accessibility-and-deeplinks.spec.ts) | Present, unverified |
| ENG-503 | [Security](HANDOFF-ENG-503.md) | [test artifact](../tests/eng503-security-hardening-and-observability.spec.ts) | Present, unverified |
| ENG-504 | [Reliability](HANDOFF-ENG-504.md) | [test artifact](../tests/eng504-reliability-chaos-dst.spec.ts) | Present, unverified |
| ENG-505 | [Store, legal and UAT](HANDOFF-ENG-505.md) | [test artifact](../tests/eng505-app-store-legal-and-uat.spec.ts) | Partial, acceptance open; simulation does not establish external approvals or real venue UAT |
| ENG-506 | [Operations and pilot](HANDOFF-ENG-506.md) | [operations implementation](../src/operations/runbooks.service.ts), [test artifact](../tests/eng506-runbooks-training-and-pilot.spec.ts) | Partial, acceptance open; endpoint checks do not establish the full launch decision |

| Mobile preview | Handoff | Evidence | Assessment |
|---|---|---|---|
| MOB-FLUTTER-001 | [Flutter Android preview](HANDOFF-MOB-FLUTTER-001.md) | [preview README](../apps/flutter-mobile/README.md) | Debug APK built, installed and confirmed foreground on one Android device; backend and payment integration remain open |

## Maintenance

2026-11-05 UI redesign: [closed implementation lease, evidence and unresolved review findings](HANDOFF-UI-REDESIGN-2026-11-05.md). Earlier reset/release/signing work remains paused and excluded.

For each meaningful work interaction, update the affected handoff and documentation, record the evidence actually checked and remaining work, and add or link an interaction checkpoint. Save changes as they are made. The [2026-11-04 interaction handoff](HANDOFF-INTERACTION-2026-11-04.md) records the current local-first direction and daily reminder request; the [ENG-004 interaction checkpoint](HANDOFF-INTERACTION-2026-11-04-ENG004.md) records the focused verification. Refresh this inventory when work changes an assessment; preserve dated history.
