# Configuration, Price & Policy Engine

## Scop
Un proprietar personalizează aproape orice regulă comercială fără cod, dar nu poate dezactiva controalele de integritate. Documentul descrie **configurație editabilă**, nu valori universal obligatorii.

## Ierarhie
`Platform constraint > resource override > zone override > room override > venue default`. Platform constraints prevalează pentru conformitate; câmpurile moștenite folosesc valoarea cu specificitatea cea mai mare.

## Config types
1. Booking: minim `60 min` în exemplul inițial, max, step granularity (15/30/60min), advance booking horizon, allowed start/end, check-in grace, extension policy, modification policy.
2. Payments: FULL / DEPOSIT_FIXED / DEPOSIT_PERCENT (`40%` exemplu); balance methods `ONLINE|RECEPTION_CARD|RECEPTION_CASH`; cutoff for due balance.
3. Cancellations: free cancellation up to `180min` example; late cancel/no-show penalty model (enabled only after legal approval).
4. Pricing: per 15/30/60min or hourly, weekday/weekend/time ranges, holiday exceptions, resource category, VIP, private room flat price, package discounts.
5. Consumables: menu, categories, tax metadata, stock, age limits, fulfillment method `AT_STATION|BAR_PICKUP`, prep cutoff.
6. Operations: open hours, maintenance windows, planned closure, visibility, photos, amenities.

## Pricing input
`venue, resources, [start,end), customer count, policy version, package code, promo, tax context`. Output immutable `Quote` with line items (resource time, pack, discount, taxes if configured/legally required), total, due-now, balance, policy snapshot, expiry.

## Rounding [PROPOSED]
- All numbers integer bani; percent discounts/promos and deposit use decimal precise arithmetic then round half-up or banker's rounding explicitly chosen by product/finance before implementation.
- `due_now` capped by booking total; minimum configured deposit must be satisfied, with edge cases for small totals.
- Group share allocation distributes remaining fractional bani deterministically and preserves total sum exactly.

## Conflict resolution
- Multiple active price rules at same specificity/time yield compile-time validation failure, nu rule order accidental.
- Different policies by zone are supported; group booking crossing zones uses **per-line pricing/policy**. For cancellation, stricter restrictive terms are not silently applied to entire booking: quote arată politica per resource, iar checkout cere consimțământ clar. Simplificare MVP recomandată: restrict group to compatible cancellation profiles or explicitly break into policy groups.
- Promoțiile au prioritate/stacking explicit (`exclusive`, `stackable`) și audit.

## Versioning
- Config draft→validated→published, `effective_from` pentru viitor; active reservations keep immutable snapshot.
- Rollback publish nu modifică rezervările deja confirmate.
- `policy_version` și `pricing_version` incluse în quote și booking audit.

## Validare
- Avans >= 0 și <= 100% (dacă permitere 0 ar transforma booking în rezervare neplătită; [PROPOSED] limit default 10%–100%, aprobabil); quote integral.
- Cancel cutoff >= 0; min duration multiplu granularity; price >= minimum economic/contractual; no discriminatory illegal rules.
- `payment balance method` conține cel puțin 1 opțiune când deposit mode.
- Resource without resolvable valid price/policy cannot be published bookable.

## Exemple de policy profiles
| Scope | Deposit | Free cancel | Min | Balance methods |
|---|---:|---:|---:|---|
| Venue default | 40% | 3h | 60m | ONLINE + RECEPTION |
| VIP zone | 50% | 6h | 120m | ONLINE |
| Private room | 100% | 24h | 180m | none |

Aceste valori sunt **exemple**, nu cerințe impuse tuturor partenerilor.

## Admin control
Edit policy → preview estimate pe 1h, 2h, 5-seat group → validate conflicts → publish effective date → audit diff. Owner vede explicit „regula aplicată” pentru fiecare resursă și diferența față de venue default.
