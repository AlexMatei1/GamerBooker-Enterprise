# Cerințe funcționale / nefuncționale și scope

## Domenii V1
| Epic | Requirement ID | Obligație (SHALL) | Prioritate |
|---|---|---|---|
| Auth | FR-AUTH-01 | Clientul se autentifică în aplicația mobilă, își poate șterge contul și vede istoricul propriu. | P0 |
| Venues | FR-VEN-01 | Descoperire locații cu detalii, facilități, tipuri resurse, prețuri orientative. | P0 |
| Layout | FR-LAY-01 | Proprietarul desenează pereți, uși, mobilier, camere/zone și resurse drag-drop, multi-room. | P0 |
| Layout | FR-LAY-02 | Editorul are draft, preview, validare și publicare revisionată. | P0 |
| Resources | FR-RES-01 | PC/console/private rooms cu ID stabil, status, configurație și calendar. | P0 |
| Booking | FR-BKG-01 | Clientul alege resurse și interval; serverul verifică overlap și creează hold. | P0 |
| Booking | FR-BKG-02 | Clientul singur creează rezervarea din aplicație; staff nu poate crea walk-in. | P0 |
| Booking | FR-BKG-03 | Single booking cu un plătitor; group booking cu split-pay sau organizator unic. | P0 |
| Booking | FR-BKG-04 | Modificare/anulare/prelungire în limitele politicii, cu calcul financiar. | P1 |
| Payment | FR-PAY-01 | Sală alege integral/avans (% sau fix) și modalitatea achitării restului. | P0 |
| Payment | FR-PAY-02 | Plată verificată de server, ledger, refunds, reconciliation, webhook idempotent. | P0 |
| Payment | FR-PAY-03 | Plată rest online și/sau la recepție, configurabil; recepția înregistrează dovada. | P0 |
| Check-in | FR-CHK-01 | Staff validează QR/cod la locație; previne utilizare multiplă. | P0 |
| Orders | FR-ORD-01 | Meniu, stoc, add-ons înainte/durante sesiune, comenzi plătite și status. | P0 |
| Orders | FR-ORD-02 | Sală configurează livrare la stație și/sau ridicare de la bar. | P0 |
| Dashboard | FR-VDC-01 | Owner poate configura locații, camere, zone, politici, tarife, produse, angajați. | P0 |
| Dashboard | FR-VDC-02 | Staff vede rezervări/sesiuni/comenzi, marchează statusul fizic manual. | P0 |
| Security | FR-SEC-01 | Izolare multi-tenant și verificare authorization la fiecare obiect/API. | P0 |
| Platform | FR-ADM-01 | Platform admin gestionează aprobări parteneri, incidente, suport, audit. | P0 |

## Explicit NON-GOALS
Nu implementează rețea de prieteni, open squads, matchmaking, chat, competiții, leaderboard, tool de streaming, software PC agent, monitorizarea hardware automată, VR/sim racing, POS fiscal complet, portofel electronic universal.

## Canale
- Client: aplicație mobilă instalabilă iOS/Android. Deep-link din QR poate conduce la instalare și, ulterior, la locație/stație.
- Owner/staff: dashboard web responsiv, protejat prin autentificare. Web-ul **nu** este canal alternativ de rezervare pentru clienți.
- Platform admins: interfață izolată și auditabilă.

## Non-functional baseline [PROPOSED]
- SLO availability API 99.9% lunar după stabilizarea producției; p95 GET availability <= 500ms pentru 1 sală/1 zi în condiții nominale, fără PSP.
- p95 confirm booking <= 2s după webhook PSP procesat; webhook event-to-state p95 <= 10s (fără întreruperi furnizor).
- 0 double-bookings confirmate; 0 plăți duble provenite din retry server; 0 acces cross-tenant confirmat.
- RPO <= 15 min și RTO <= 4h pentru DB (de validat prin exercițiu de restore); backup criptat zilnic + PITR.
- WCAG 2.2 AA ca țintă de proiectare UI; dark mode, contrast, screen reader, touch targets.
- Datele monetare în integer minor units și audit append-only.
- Internationalizare pregătită, lansare RO/RON; UTC în stocare și timezone per venue.
- Observabilitate: trace ID, event logs, metrici tranzacționale, alerting.

## Politica P0/P1
P0: blocant pentru acceptarea fluxului de rezervare, plată, preț, consumabile și integritate. P1: necesar pentru experiență de produs V1, dar poate fi livrat într-un increment ulterior de pilot numai cu aprobare formală și calendar, nu eliminat tacit.
