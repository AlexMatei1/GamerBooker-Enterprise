# Avans, sold și plata diferenței online / la recepție

## Configurări per venue
```json
{
  "payment_policy": {
    "mode": "DEPOSIT_PERCENT",
    "deposit_percent": 40,
    "balance_methods": ["ONLINE", "RECEPTION_CARD", "RECEPTION_CASH"],
    "deposit_credit_scope": "GAMING_ONLY",
    "require_balance_before_checkin": false,
    "allow_early_online_balance_payment": true
  },
  "cancel_policy": {"free_until_minutes_before_start": 180},
  "booking_policy": {"minimum_minutes": 60}
}
```
Valori de exemplu, configurabile. Pentru `deposit_credit_scope=ELIGIBLE_VENUE_SPEND`, toate alocările trebuie să păstreze încasarea garantată pentru timpul de gaming rezervat.

## Contabilizare logică
- `booking_total_minor`: cost contractual gaming.
- `due_now_minor`: valoarea minimă necesară la confirmare.
- `paid_gaming_minor`: sume aplicate obligației gaming.
- `paid_consumables_minor`: sume aplicate produselor.
- `remaining_gaming_minor = total_gaming_minor - paid_gaming_minor - approved_adjustments`, limitat și auditat.
- `refund_liability_minor`: sume de rambursat încă neexecutate.
- Niciodată `remaining` negativ; overpayment -> refund/credit return documentat, nu veniturile sălii.

## Exemplu [CONFIRMED exemplificativ]
100 RON 2h gaming, avans 40 RON, rest 60 RON. Sala permite online/reception. Clientul poate:
1. plăti 60 RON prin PSP în aplicație → paid gaming 100 RON;
2. plăti 60 RON cu card/cash la recepție → staff înregistrează tranzacția efectivă → paid gaming 100 RON;
3. plăti 20 RON online + 40 RON la recepție dacă plata parțială este activată [PROPOSED: disabled V1 pentru reducerea complexității].

## Plată la recepție
- Staff trebuie să introducă sumă, metodă `CASH|CARD_TERMINAL`, referință bon/factură/receipt și să confirme că a fost încasată **în afara aplicației**.
- Nu există integrare POS obligatorie în V1; dashboard-ul nu este instrument fiscal și nu produce automat documente fiscale valide.
- `offline_receipts` sunt immutable; corecția se face prin reversal/adjustment aprobat și audit, nu edit silent.
- Managerul vede reconcilierea zilnică per cashier/venue și raportul soldurilor.

## Politică aplicare avans
- `GAMING_ONLY`: avans alocat exclusiv obligației timpului de joc.
- `ELIGIBLE_VENUE_SPEND`: sală poate specifica ce produse/servicii sunt eligibile, dar nu se permite reducerea obligației de rezervare fără un mecanism explicit de acoperire a acesteia. **Recomandare V1:** numai gaming; suportul extins poate fi introdus ulterior fără schimbarea ledger-ului.
- Dacă se oferă pachet gaming + produs, componentele sunt alocate la checkout pe line items, nu devin un wallet nedefinit.

## Momentul scadenței
- `balance_due_policy`: BEFORE_CHECKIN / AT_CHECKIN / BY_SESSION_END (configurabil doar dacă operațional și juridic acceptat); decizia finală se documentează în management settings.
- Clientul vede în aplicație suma restantă și deadline; notificare la check-in/înainte de expirare.
- Nu ștergem booked obligations când sesiunea se încheie; rămân în receivables până la settlement sau ajustare auditată.

## Protecție contra dublării
- Receipt ingestion are idempotency key per venue/cashier/reference. Concurența online PSP + recepție verifică `remaining` under DB lock înainte de commit.
- La detectarea supraplății, operațiunea de recepție este refuzată sau sursa încasării excedentare trece la refund, după caz.
