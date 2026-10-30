# Payment architecture — intents, PSP, ledger, webhook

## Model general
Sunt două tipuri distincte de valori: (1) **obligația de gaming** pentru intervalul rezervat; (2) **obligația de produs** pentru comenzi consumabile. O plată poate fi alocată explicit între ele, dar fiecare ban se consumă o singură dată. Încasările de la recepție se înregistrează separat de PSP.

## Modes [CONFIRMED]
- Full prepaid: due-now = total booking; no balance pentru sesiunea inițială.
- Deposit: due-now = avans configurat (fix/%) din total; după confirmare există sold. Restul poate fi `ONLINE_ONLY`, `RECEPTION_ONLY`, `ONLINE_OR_RECEPTION` (config per venue).
- Solo: un singur customer plătește 100% din due-now; grup: `ORGANIZER_PAYS_ALL` sau shares cu payment intents separate.

## Payment domains
`PaymentAttempt` (created/pending/authorized/captured/failed/cancelled), `LedgerTransaction`, `BalanceAllocation`, `Refund`, `Receivable`, `OfflineReceipt`, `Payout/Settlement` (PSP-dependent).

## Quote pricing example
```
Booking total: 10000 bani
Deposit percent: 40
Due at booking: 4000 bani
Remaining gaming obligation: 6000 bani
Order add-on: 1700 bani (separate)
Online order payment: 1700 bani
Total gaming captured: 4000 bani
Total paid online incl order: 5700 bani
Outstanding gaming: 6000 bani
```
Nu se deduce automat o comandă de 17 RON din avansul gaming fără o politică de credit eligibil explicită și fără păstrarea obligației pentru orele rezervate.

## PSP API adapter
```ts
interface PaymentProvider {
  createIntent(input: {amountMinor:number; currency:'RON'; reference:string; idempotencyKey:string}): Promise<{providerRef:string; clientSecret?:string}>;
  getStatus(providerRef:string): Promise<'PENDING'|'CAPTURED'|'FAILED'|'CANCELLED'>;
  refund(input: {providerRef:string; amountMinor:number; idempotencyKey:string}): Promise<{refundRef:string}>;
  verifyWebhook(rawBody: Uint8Array, signature: string): VerifiedProviderEvent;
}
```

## Trust boundary
- Backend calculează orice sumă, nu aplicația; server validează price quote version și ownership.
- PSP webhooks sunt semnate, salvate cu event ID unic și procesate idempotent.
- `payment success` în UI nu este dovadă; numai serverul schimbă statusul booking după PSP confirm + valid hold.
- Clientul primește provider token pentru completarea plății prin SDK; nu se persistă PAN/CVV pe server.

## Ordering + failure modes
1. Hold durable și payment intent created.
2. PSP capture poate fi asincron; callback -> ledger capture.
3. Dacă all dues paid și hold încă valid → confirm; altfel refund task (holding account unassigned până la reconciliere).
4. Dacă provider response timeout, citim status provider înainte de retry; același idempotency key previne duplicate.
5. Dacă manual refund e refuzat, retry/backoffice alert; nu raportăm ca `REFUNDED` până PSP confirmă.

## Settlement model [LEGAL-REVIEW]
Alegeți cine este merchant of record, beneficiarul veniturilor, procesatorul responsabil de KYC, comisioanele, chargeback-urile și facturarea. Nu construiți transferuri de fonduri manuale între comercianți înainte de verificarea dreptului de a opera modelul marketplace.
