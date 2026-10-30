# Decision register — puncte de aprobat înainte de producție

Product Discovery este **închis**; întrebările de mai jos sunt decizii de implementare/comercial/legal și **nu redeschid scope-ul**. Echipa poate proiecta folosind valorile propuse, dar nu poate activa în producție fluxuri blocate legal sau financiar fără semnătură.

| ID | Decizie rămasă | Default propus | Blocant când? | Owner propus |
|---|---|---|---|---|
| OI-001 | PSP / marketplace eligibility România | Provider-adapter, PSP sandbox | Live payments | Finance + Legal |
| OI-002 | Merchant of record, payout model, bon/factură | Sală comerciant; verificare contract | Live payments | Legal + Finance |
| OI-003 | Late cancel/no-show penalty | 0 implicit până la policy aprobată | Activare penalties | Legal + Product |
| OI-004 | Hold TTL | 15 minute | Load/pilot QA | Product + Eng |
| OI-005 | Grace period | 15 minute | Pilot no-show | Product + Venue |
| OI-006 | Group policy mixing across zones | Restrict group la condiții compatibile V1 | Cross-zone group | Product |
| OI-007 | Deposit credit on consumables | Gaming only V1, extensibil model | Venue-spend activation | Finance + Product |
| OI-008 | Remaining balance due timing | At check-in default, configurable | Cash operational testing | Venue + Legal |
| OI-009 | Payment partial remaining combinations | One final settlement per payer V1 | Split remainder | Finance |
| OI-010 | Platform commission final | 0% pilot | Billing launch | Founder |
| OI-011 | Minors and age verification scope | restricted product staff check | Sale restricted items | Legal |
| OI-012 | GDPR roles, retention | Minimization + retention matrix | Production | DPO/Legal |
| OI-013 | App store distribution compatibility | Native app, physical service PSP | Mobile launch | Mobile lead |
| OI-014 | Venue onboarding authority validation | manual pilot verification | Onboard venue | Ops |
| OI-015 | Guest/no-smartphone exclusion risk | Customer app-only confirmed | Pilot go/no-go | Founder |
| OI-016 | Prices/tax/VAT treatment of packages | per-line allocation | Live product sales | Fiscal advisor |
| OI-017 | Feature flags, SLA/SLO targets | see NFR | GA | SRE/Founder |
| OI-018 | Private room resource remapping | block publish when booked | Layout publish | Eng |

## What is NOT open
- Nu discutăm introducerea funcțiilor sociale.
- Nu discutăm crearea rezervării de staff în numele clientului.
- Nu discutăm agent PC sau control hardware.
- Nu discutăm eliminarea consumabilelor din V1.
- Nu discutăm revenirea la editor simplu de locuri, fără desenare liberă.

## Approval form
`ID / owner / resolution / rationale / impact on API+DB / legal signoff if needed / signed_at / spec revision`. Hotărârile care schimbă deciziile [CONFIRMED] necesită change request explicit și versiune nouă a documentației.
