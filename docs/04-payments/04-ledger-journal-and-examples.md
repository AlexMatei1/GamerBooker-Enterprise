# Ledger de plăți — scheme de jurnal și exemple contabilizate

## De ce un ledger
Nu derivăm soldul doar din `sum(payments)`. Avem evenimente distincte: obligation, capture, allocation, reversal, refund, offline receipt, adjustments. Fiecare înregistrare poartă idempotency key, actor, reason și reference.

## Accounts (logical operational ledger; NU substituie contabilitatea fiscală)
- `CUSTOMER_RECEIVABLE`: sumă restantă contractuală.
- `PSP_CLEARING`: încasări online încă nedecontate / clarificate.
- `RECEPTION_CASH_CLEARING`, `RECEPTION_CARD_CLEARING`: încasări la recepție înregistrate în sistem.
- `VENUE_CONTRACT_LIABILITY`: obligație față de sala care livrează serviciul / decontare conform contractului.
- `REFUND_PAYABLE`: sumă datorată clientului pentru rambursare.
- `PLATFORM_COMMISSION_RECEIVABLE`: comision dacă există contract.

**Important:** nomenclatura este operațională și trebuie reconciliată cu modelul merchant-of-record, contractul PSP și contabilitatea reală înainte de implementare.

## Exemplu 1 — un PC 100 RON, avans 40%
| Moment | Booking total | Online applied | Offline applied | Gaming remaining | Refund pending |
|---|---:|---:|---:|---:|---:|
| Quote | 100,00 | 0,00 | 0,00 | 100,00 | 0,00 |
| Booking confirm | 100,00 | 40,00 | 0,00 | 60,00 | 0,00 |
| Reception balance | 100,00 | 40,00 | 60,00 | 0,00 | 0,00 |
| Final reconciliation | 100,00 | 40,00 | 60,00 | 0,00 | 0,00 |

Nu aplicați avansul și ca reducere de 40 RON la bonul de mâncare fără mutare explicită a creditului și menținerea soldului gaming corect.

## Exemplu 2 — split-pay expiră cu 4/5 plăți
5 PC × 2h = 200 RON. Avans 40% = 80 RON: fiecare ar fi plătit 16 RON.
- 4 plătitori × 16 RON = **64 RON capturate**.
- Hold expiry înaintea plății persoanei 5 → **0 booking confirmate** și **0 obligație de gaming onorată**.
- Refund liabilities pentru cei 4 plătitori: 16 RON fiecare, total 64 RON.
- La provider success, `refund_pending` scade iar `refunded` crește; nu mai marcați plată ca disponibilă pentru booking altul.

## Exemplu 3 — anulare în perioada gratuită
Booking 100 RON, avans plătit 40 RON, sold 60 RON. Cancel before free cutoff → booking CANCELLED; entitlement refunded 40 RON; remaining 60 RON void; total customer obligation 0 conform contractului. Până confirmă PSP, UI arată „Refund pending 40 RON”, nu „Refund completed”.

## Exemplu 4 — consumabile
Client comandă Cola 8 RON din timpul sesiunii; payment line separată 800 bani; order confirmă după PSP capture; stock reserved. Dacă produsul nu poate fi livrat și clientul refuză substitute, refund 800 bani la plata originală; gaming balance rămâne neschimbat.

## Invarianta operațională
Pentru fiecare booking: `obligation_total - authorized_discounts - cancellations/approved_credits = applied_captures + outstanding_receivable` (după deducerea refunds/reversals din applied captures). Toate valorile derivează din entries append-only, nu din valori client.

## Audit and reconciliation
- Pentru fiecare capture: provider payment ID, payer, amount, timestamp, booking/order reference, allocation breakdown.
- Pentru fiecare offline receipt: cashier, terminal/card/cash, external bon id, linked booking, proof retention policy.
- Pentru fiecare refund: original capture, reason, policy snapshot, recipient same payer, exact amount, PSP status.
- Daily comparison: provider statement, platform operational ledger, recepție external POS/cash register. Mismatch blocking pentru settlement normal dacă peste threshold [PROPOSED].
