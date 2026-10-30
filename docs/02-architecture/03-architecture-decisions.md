# Architecture Decision Records (ADR)

## ADR-001 — Modular monolith
**Status:** Proposed. **Context:** tranzacții financiare și disponibilitate cu invariantă puternică. **Decision:** un serviciu backend modular + PostgreSQL. **Tradeoff:** deploy comun, dar consistență și operare simplă. Se extrag servicii după metrici reale.

## ADR-002 — PostgreSQL ca sistem de adevăr
**Status:** Proposed. **Decision:** booking claims, policies, ledger, inventory tranzacțional în PostgreSQL; Redis doar cache/rate limit. **Reason:** exclusion constraints, transactions și audit. **Consequence:** nu folosim Firestore direct ca mecanism primar de hold contra suprapunerilor din prototip.

## ADR-003 — Venue configurability via versioned policies
**Status:** Confirmed requirement / Proposed method. **Decision:** inheritance venue→room→zone→resource; snapshot al rule set și preț la quote/booking. **Consequence:** modificările viitoare nu schimbă rezervări confirmate.

## ADR-004 — App-only self-booking
**Status:** Confirmed. **Decision:** toate rezervările create prin aplicație de către utilizator; QR de locație doar onboarding/deep-link. **Risk:** excluderea fără smartphone/internet; test pilot înainte de lansare.

## ADR-005 — No PC agent
**Status:** Confirmed. **Decision:** personalul marchează check-in/check-out/maintenance; niciun lock OS sau detectare hardware. **Risk:** ocuparea fizică nu este detectabilă automat. **Mitigation:** acțiuni rapide staff + reconciliere.

## ADR-006 — Split-pay atomic reservation
**Status:** Confirmed behavior / Proposed design. **Decision:** group hold + multiple payment intents, confirmed only on all necessary funds; timeout triggers refunds. **Alternative rejected:** confirmare parțială și datorii ascunse.

## ADR-007 — Flexible editor 2D
**Status:** Confirmed requirement. **Decision:** scene model separă walls/furniture/shapes de normalized bookable resources; immutable revisions. **Consequence:** proprietarul poate redesena fără schimbarea identității resurselor.

## ADR-008 — Provider-agnostic payments
**Status:** Proposed. **Decision:** adaptor și webhook reconciler; suport marketplace dacă PSP oferă; nu stocăm card PAN/CVV. **Pending:** disponibilitate/regim contractual/taxe în România.

## ADR-009 — Full customer app distribution
**Status:** Confirmed. **Decision:** iOS și Android native-distributed; web dashboard only for partner staff/admin. **Consequence:** QA App Store/Play și deep link flows obligatorii.

## ADR-010 — No social feature leakage
**Status:** Confirmed. **Decision:** `booking_participants` există numai pentru rezervare și plată; nu creează social graph, discoverable profiles, chat sau ranking.
