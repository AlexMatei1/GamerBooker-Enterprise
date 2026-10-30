# Decizii, trasabilitate și priorități

## Baseline de produs
| ID | Decizie | Status | Document(e) | Validare |
|---|---|---|---|---|
| DEC-001 | Produs exclusiv de rezervări; fără social, matchmaking, turnee | CONFIRMED | Scope | Revizie scope |
| DEC-002 | PC + console în V1; camere private rezervabile | CONFIRMED | Data model, Availability | E2E PC/console/room |
| DEC-003 | Rezervare numai de client din aplicație; inclusiv la fața locului | CONFIRMED | Mobile, Booking | Test QR->instalare->rezervare |
| DEC-004 | Prepaid integral/avans configurabil per sală | CONFIRMED | Payments, Policies | Test ambele moduri |
| DEC-005 | Rest avans online și/sau recepție, configurabil | CONFIRMED | Payments | Evidență sold și casă |
| DEC-006 | Solo: un plătitor; grup: split sau organizator | CONFIRMED | Group Bookings | Tranzacții partial/success/timeout |
| DEC-007 | Consumabile V1: înainte/în sesiune; stație/bar | CONFIRMED | Orders | Stock + handoff |
| DEC-008 | Visual editor liber, multi-room, rezervare camere întregi | CONFIRMED | Layout | Publicare și nesting |
| DEC-009 | Fără agent PC; personalul confirmă statusul fizic | CONFIRMED | Check-in, Venue | Test manual/check-in |
| DEC-010 | Exemplar default: avans 40%, free cancel 3h, min 60m | CONFIRMED as configurable example | Policies | Test override per zonă |
| DEC-011 | Draft/publish + preview + versionare layout | ACCEPTED DESIGN | Layout | Version conflict tests |
| DEC-012 | Blocare temporară la checkout 15 minute | PROPOSED | Availability | Load test + pilot |
| DEC-013 | Grace period 15 minute | PROPOSED | Check-in | Pilot și legal review |
| DEC-014 | Backend modular monolith / PostgreSQL | PROPOSED | Architecture | ADR review |
| DEC-015 | Pilot fără comision al platformei, apoi tarif validat | PROPOSED | Commercial | Aprobarea modelului |

## In scope V1 (livrare incrementală)
- A: identitate, listare, management locații, inventar PC/console/private rooms, calendar, pricing și policy.
- B: aplicație mobilă, selectare exactă, hold, single booking, full/deposit, QR și notificări.
- C: group split-pay, checkout atomic, handling expirare/rambursări.
- D: comenzi catalog/stoc/plată/fulfillment la stație sau bar.
- E: editor vizual liber, multi-room, layout versions, draft/preview/publish și publish validation.
- F: dashboard proprietar/operator, RBAC, audit, rapoarte de bază, reconciliation.

## Excluse explicit
- Social graph/friends/invitații de prietenie, public squads, matchmaking, turnee, leaderboard, grupuri de chat, streaming.
- Agent local de pornire/oprire PC, monitorizare hardware automată, integrare OS sau cloud gaming.
- VR/Sim Racing V1, un wallet financiar universal, puncte convertibile în bani.
- POS fizic complet și gestiune contabilă generală: dashboard doar înregistrează plăți încasate la recepție conform procedurii.

## Cerințe vs interpretări
- „Individual plătește întreaga sumă” = întreaga **obligație online la booking**. Dacă sala acceptă avans 40%, nu contrazicem modelul de avans: același utilizator plătește singur 40% din total, nu tot totalul.
- „Fără rezervări fără app” = nu există operații staff create-on-behalf; personalul poate verifica, bloca resurse și administra rezervări existente.
- „Rest online/recepție” = modalitatea acceptată configurată de sală, nu libertatea implicită de a evita înregistrarea în ledger.
- „Cameră privată” = resursă compozită, cu închiderea disponibilității resurselor incluse; nu poate fi rezervată simultan separat.

## Issue policy
Un punct nerezolvat din `99-open-issues-and-approvals.md` este **non-blocking pentru design** dacă are o propunere explicită, dar **blocking pentru lansare** dacă afectează legalitatea, fluxul banilor, comerțul cu produse restricționate sau responsabilitatea fiscală.
