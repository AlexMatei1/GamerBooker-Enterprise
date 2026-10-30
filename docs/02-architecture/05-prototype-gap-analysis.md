# Audit de migrare: prototip HTML → GamerBooker V1

## Ce există în `odsasda.html`
- HTML/CSS mobile-first (lățime maximă 420px), pagini `home`, `booking`, `snacks`, `success`.
- Carduri locații ilustrative, categorii eSports/Sim Racing/VR, fotografii, prețuri orientative, dar **doar primul buton de rezervare parcurge fluxul**.
- Selectare statică loc `data-id`, sală standard și VIP, `toggleSeat()` cu preț per stație, `activateTeamMode()` selectează primele 5 din rând.
- Consumabile hardcodate (`monster`, `cola`, `water`), total simplu = `seatsTotal + snacksTotal`.
- `generateTicket()` persistă în `db.collection("rezervari").add(...)` cu `selectedSeatIds`, cantități, total și `new Date().toLocaleString("ro-RO")`.

## Gap analysis
| Aspect | Prototip | Țintă enterprise |
|---|---|---|
| Authentication | Fără login funcțional | Identitate verificabilă, RBAC |
| Date/time/duration | Ticket-ul afișează „Azi, 20:00”; timp neimplementat | Interval UTC [start,end), timezone DST |
| Real availability | CSS `occupied` hardcoded | DB exclusion claims + hold TTL |
| Venue catalog | Carduri statice / demo | Multi-tenant venues, rooms, policies |
| Groups | 5 selecții locale în DOM | Booking + participants + split-pay + refund |
| Pricing | Preț din `onclick` client-side | Server quote, taxes, policy snapshot, minor units |
| Payments | Nu există PSP | PSP intent, webhook, ledger, offline receipt |
| Consumables | Contoare în browser, fără stock | Catalog, stock locks, orders, fulfillment |
| Layout | Poziții CSS/HTML fixe | Drag-drop free-form, multi-room, publish revisions |
| Private room | VIP seats, nu room booking | Compozite exclusive room + child resource claims |
| QR/check-in | Ticket text | QR revocable/replay-safe & staff dashboard |
| Cancellation | Nu există | Snapshot policy, refund and notifications |
| Observability | `console.log()` și `alert()` | Tracing, audit, alerting, incident runbooks |

## Security cautions
- Firebase client configuration in HTML nu este automat o vulnerabilitate, dar accesul la Firestore **trebuie** controlat prin auth și security rules. Schema demonstrativă nu implementează safeguards pentru atomicitate, tenant access sau prețuri.
- Nu copiați API keys, endpoint-uri demo ori logică de încasare fără revizuire completă. Niciun client nu scrie `total_plata`/`payment_status` direct într-o bază de date de producție.
- `innerHTML` folosit dinamic necesită revizie XSS înainte de reutilizare; preferați componente care escapează date.

## Migration plan
1. Extrageți doar flow-ul UX și ideile de layout ca referință, nu state management demo.
2. Implementați DB versioned venue/resource/booking/policy/payment.
3. Construiți endpoint-uri server quote/hold, apoi UI app nouă.
4. Dashboard editor produce scene publicate folosite de client, nu CSS static per venue.
5. Validați P0 tests și pilot înainte de a șterge prototipul.

**Concluzie:** prototipul este o referință vizuală pentru cerințe, nu un MVP plătibil și nu dovada rezervărilor live.
