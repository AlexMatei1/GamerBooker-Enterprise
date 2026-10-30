# Event contracts, transactional outbox și jobs

## Evenimente de domeniu
| Event | Key | Producer | Consumers |
|---|---|---|---|
| HoldCreated.v1 | hold_id | Booking | notifications/analytics |
| HoldExpired.v1 | hold_id | Booking | payment-refund worker |
| PaymentCaptured.v1 | payment_intent_id | Payments | booking settlement |
| PaymentFailed.v1 | payment_intent_id | Payments | UI notifications |
| BookingConfirmed.v1 | booking_id | Booking | notification, venue agenda |
| BookingCancelled.v1 | booking_id | Booking | refunds, order compensator |
| BookingChanged.v1 | booking_id:version | Booking | notifications |
| CheckedIn.v1 | booking_id | Check-in | operations |
| OrderPlaced.v1 | order_id | Orders | bar queue |
| OrderReady.v1 | order_id | Orders | notification |
| OrderHandedOff.v1 | order_id | Orders | stock/accounting |
| RefundSucceeded.v1 | refund_id | Payments | customer/venue notification |
| LayoutPublished.v1 | venue_id:revision | Layout | app layout cache invalidation |

## Envelope
```json
{
  "id": "<event-uuid>",
  "type": "BookingConfirmed.v1",
  "aggregate_id": "<booking-uuid>",
  "aggregate_version": 4,
  "occurred_at": "2026-11-06T17:44:10Z",
  "tenant_id": "<tenant-uuid>",
  "venue_id": "<venue-uuid>",
  "trace_id": "<trace-id>",
  "payload": {"booking_id":"<booking-uuid>","start_at":"...","end_at":"..."}
}
```

## Outbox
- Writer inserts domain change + event row în aceeași tranzacție.
- Background publisher sends events at least once; consumer dedupe by `event.id` and `aggregate_version`; stale transitions ignored.
- Retry with bounded attempts, exponential backoff, dead-letter queue/alert; manual replay safe after repair.
- Financial events may require strict ordering per aggregate; no ordering guarantee globally across bookings.

## PSP webhook
- Verify cryptographic signature using raw body, provider timestamp, event replay limits; reject unsigned/invalid events.
- Persist provider `event_id` unique before processing; respond 2xx after durable ingest; exact status only from PSP verification.
- Webhook duplication/inversion: use state-machine guards + provider status query. Paid after expiry triggers refund, not booking confirmation.

## Periodic jobs
- `expire_holds`: short interval, mark released and trigger refunds for captured shares.
- `reconcile_payments`: frequently for pending, daily for full settlement.
- `send_reminders`: due scheduled notifications respecting preferences and venue timezone.
- `orders_age_alert`: operational aged orders.
- `resource_maintenance_notification`: pending bookings at-risk.
- `backup_verify`: daily; `restore_drill`: monthly [PROPOSED].

## Idempotency matrix
| Command | Key scope | Window |
|---|---|---|
| Create hold | customer + request payload | >=24h or hold lifecycle |
| Create PSP intent | booking/order + payer + purpose | permanent provider ref mapping |
| Payment captured webhook | PSP event id + provider payment ref | permanent |
| Cancel booking | booking + target version | permanent outcome |
| Refund | capture + reason + amount + refund request id | permanent |
| Offline receipt | venue + cashier reference + booking | permanent |
| Order handoff | order + handoff stage | permanent |

Semantica exactă a expirării cheilor pentru non-financial requests poate fi limitată; invarianta financiară are dedupe pe durata retenției necesare.
