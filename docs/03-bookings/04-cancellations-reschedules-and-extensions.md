# Anulări, modificări, prelungiri și no-show

## Obiectiv
Permitem flexibilitate fără compromiterea inventarului sau a banilor deja încasați. Orice politică este afișată înaintea rezervării și memorată ca snapshot.

## Anulare gratuită
- Exemplar venue: `free_cancel_until = start_at - 3h`; pentru anulări până la limită inclusiv, penalitate `0` [configurabil, pre-validat legal].
- Anulare târzie: funcție `late_cancel_penalty` configurată în limite acceptate contractual/legal, explicit vizibilă înainte de cumpărare. Nu presupunem automat confiscarea integralului.
- Rambursarea este calculată per paid allocation, fără a atinge order lines deja predate.
- Taxele PSP nerecuperabile sunt tratate conform contractelor și legislației, fără inventarea unei taxe a clientului.

## Reschedule (schimbarea rezervării)
```text
GetChangeQuote(current_booking, proposed_resources, proposed_interval)
Validate(policy_snapshot allows change)
Hold new atomic resource set (exclude original claims from self-conflict where applicable)
Calculate delta_total, delta_due_now, refundable_difference
If delta_due_now > 0: confirm PSP payment
Atomic transaction: move claims; revise booking with change record
Release held alternative; publish change notification
On failure: preserve original booking and amounts, refund extra captures
```
- Evităm fereastra în care clientul pierde booking-ul original înainte să confirme pe cel nou.
- Orice modificare cu diferență financiară produce quote nou și consent explicit.
- Modificarea este interzisă după începutul sesiunii, cu excepția prelungirii suportate și a intervențiilor de staff.

## Prelungiri
- Clientul solicită +15/+30/+60 min (conform granularity) în aplicație; backend verifică slot contigu liber.
- Dacă nu este liber, returnează opțiuni alternative, nu mută automat clientul.
- Plata extinderii (suma datorată acum) trebuie finalizată înainte să fie confirmat noul interval.
- Fără software PC, stop/time-up reprezintă convenție contractuală și măsurare de sistem; staff intervine fizic.

## No-show
- Prag propus grace 15min după start; politica poate fi configurabilă și aprobată per sală.
- Staff verifică dacă echipamentul este într-adevăr neocupat înainte de eliberare pentru revânzare; log `staff_verified_empty=true`.
- Reținerea sumelor se bazează pe politica snapshot și legal review; dacă politica nu definește penalitatea, nu se aplică reținere inventată.

## Venue fault / resource unusable
- Proprietarul poate oferi resursă echivalentă cu confirmarea clientului sau refund proporțional/total pentru serviciul neprestat, conform cazului.
- Dacă private room este indisponibilă, alternativa trebuie să satisfacă întreaga capacitate și exclusivitate; altfel nu se propune ca echivalentă.
- Incident log cu motiv și responsabil; raportare de refund.

## Matrice de plăți [EXEMPLU]
| Condiție | Total | Capturat | Penalitate | Refund | Rest |
|---|---:|---:|---:|---:|---:|
| Cancel free | 100 | 40 | 0 | 40 | 0 |
| Cancel late cu penalitate contractuală 20 | 100 | 40 | 20 | 20 | 0 |
| Venue cancels | 100 | 40 | 0 | 40 | 0 |
| Check-in normal | 100 | 40 | n/a | 0 | 60 |

Cifrele sunt ilustrative, nu aprobă o penalitate sau un regim juridic.
