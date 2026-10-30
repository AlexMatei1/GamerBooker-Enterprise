# Consumables — catalog, stock, packages

## Scope [CONFIRMED]
Produse comandabile în aplicație înaintea rezervării sau în timpul sesiunii: băuturi, gustări, mâncare și pachete asociate rezervării. Sala configurează meniul și metodele de predare.

## Product schema
`product_id, venue_id, category_id, title, description, image, price_minor, currency, tax_category, active, inventory_tracking, stock_qty, min/max_qty, preparation_minutes, fulfillment_methods[], restricted_product_type, age_verification_required`.
- V1 stock simple quantities; dacă preparatele sunt compuse, inventar ingredient-level este OUT OF SCOPE; sală actualizează manual stocul produsului finit.
- Product price snapshot în order line; modificarea prețului nu alterează comenzi plătite.

## Stock reservations
- `available_stock = on_hand - reserved`; stock deduction la order accept/hand-off (alegere explicită și consecvență).
- La checkout: `SELECT stock FOR UPDATE`, rezervă qty; dacă plata eșuează/expire, stocul se eliberează.
- Pentru produse fără stoc numeric, sală poate marca `AVAILABLE|PAUSED|OUT_OF_STOCK`, dar nu pretindem limită perfectă de inventar.
- Return/void are `StockMovement` compensator, nu overwrite la total.

## Pachete
- Package `3h PC + Cola + Chips`: combină un line de resursă și line-uri de produse cu preț alocat per componentă.
- Trebuie respectate timpul de booking și stocul simultan; dacă un produs nu e disponibil, pachetul nu este confirmat sau oferă înlocuire cu consimțământ.
- Discount package aplicat transparent, tax breakdown corect, audit price snapshot.

## Preorder
- Clientul poate alege produse în checkout booking; operațiunea nu confirmă comanda dacă booking-ul nu devine confirmed.
- Fulfillment la arrival/check-in sau în intervalul configurat; stocul rezervat din momentul plății, cu TTL/retention și risc de produse perisabile.
- Recomandare [PROPOSED]: restricționați preorder pentru produse cu timp scurt de păstrare înainte de a valida operațiunile.

## Produse reglementate [LEGAL-REVIEW]
- Băuturile energizante nu se comercializează minorilor conform Legii 42/2024; definim flag de restricție, avertizare la checkout și verificare vârstă/act de identitate la predare.
- Nu folosim doar o bifă de 18+ drept dovadă legală suficientă. Se configurează product age eligibility + staff verification; reguli pentru alte produse sunt supuse juristului.
- Nu se recomandă lansarea vânzării de produse cu regim special până la validarea cerințelor licențe/fiscalitate.

## Bulk imports
CSV de produse pentru sală; validare schema, imagini, categorii, stoc nonnegative, dedupe SKU; dry-run și atomic apply pentru batch valid.

## Observabilitate
Menu availability, attach rate, stock-out %, order refunds, prep time, fulfillment rate, best-selling items; fără personal profiling nejustificat.
