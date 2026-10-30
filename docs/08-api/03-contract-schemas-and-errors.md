# API schemas, state guards și errors detalizate

## Core schema: booking quote
```ts
type Currency = 'RON';
type PaymentMode = 'FULL' | 'DEPOSIT_FIXED' | 'DEPOSIT_PERCENT';
type BalanceMethod = 'ONLINE' | 'RECEPTION_CARD' | 'RECEPTION_CASH';
type ResourceType = 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
type BookingState =
  | 'DRAFT' | 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED'
  | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'NO_SHOW';

type PriceLine = {
  lineId: string;
  resourceId: string;
  quantity: number;
  startAt: string; // RFC3339 UTC
  endAt: string;
  unitMinor: number; // integer bani
  subtotalMinor: number;
  discountMinor: number;
};

type BookingQuote = {
  id: string;
  venueId: string;
  userId: string;
  expiresAt: string;
  currency: Currency;
  totalMinor: number;
  dueNowMinor: number;
  balanceMinor: number;
  paymentMode: PaymentMode;
  allowedBalanceMethods: BalanceMethod[];
  policyVersion: string;
  policySnapshot: Record<string, unknown>;
  lines: PriceLine[];
};
```

## Mutation guarantees
- `POST /quotes`: deterministic price for frozen catalog/policy version, no hold. `expires_at` limits validity.
- `POST /holds`: atomic exclusive claim, may return `RESOURCE_UNAVAILABLE` on race. `hold_id` never inferable from customer input.
- `POST /holds/{id}/checkout`: payer authenticated and belonging to confirmed participant payment plan; no price override accepted.
- `GET /bookings/{id}`: view restricted to booking holder/participant or venue staff; staff sees minimal personal data.
- `POST /staff/bookings/{id}/offline-receipts`: idempotency required, staff role, `amount_minor <= current remaining under lock`, required `method`,`receipt_reference`; audit trail.
- `POST /staff/orders/{id}/transition`: compare-and-swap `expected_state` and `expected_version`, skip duplicate handoff with 200 already-applied.
- Layout publish: `If-Match` revision number, error 409 if concurrent edit.

## Standard error envelope
```json
{
  "error": {
    "code": "RESOURCE_UNAVAILABLE",
    "message": "Stația selectată nu mai este disponibilă în intervalul dorit.",
    "details": {"resource_id":"<uuid>","requery_required":true},
    "request_id": "<trace-id>",
    "retryable": false
  }
}
```

## Recovery matrix
| Error code | Client response | Server side |
|---|---|---|
| QUOTE_EXPIRED | Re-quote + new consent | no capture with stale price |
| HOLD_EXPIRED | Re-select slot | refund late capture |
| RESOURCE_UNAVAILABLE | Show alternatives | no new claims |
| PAYMENT_PENDING | Poll status; don't pay twice | PSP status query |
| PAYMENT_FAILED | Retry payment if hold active | update attempt only |
| PAYMENT_CAPTURED_UNASSIGNED | Refund pending / contact | orphan cash reconcilier |
| BALANCE_CHANGED | Refresh owed amount | transaction re-check |
| VERSION_CONFLICT | Load latest draft revision | preserve original draft |
| PRODUCT_OUT_OF_STOCK | Remove/reselect SKU | release stock reservation |
| ORDER_ALREADY_HANDED_OFF | Show completed | no duplicate decrement |
| FORBIDDEN | Access denied | log security event |
| VENUE_NOT_PUBLISHED | Not bookable | never leak private draft |

## Authorization policy examples
- Customer is authorized for booking if they are creator/accepted participant **and** action belongs to their own financial allocation; `bookingId` existence alone isn't enough.
- Reception may `checkin` booking of its venue but not write pricing; cross-tenant resource is `404` to prevent enumeration.
- Owner may update venue config but cannot mutate platform-owned `payment_provider_secret` or bypass anti-overlap.

## Public cache rules
- `GET layout` and public `GET venue` may cache with ETag/version; never cache personalized price quote for other user, booking, payment, or order.
- Availability can be advisory cached briefly, but backend always revalidates during hold.
