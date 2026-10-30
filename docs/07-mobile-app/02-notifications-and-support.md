# Notificări, chitanțe și suport utilizatori

## Evenimente de notificare
| Event | Canal | Conținut minim | Timing |
|---|---|---|---|
| BookingConfirmed | Push/email | cod, venue, interval, resurse, due/balance | immediately |
| BookingExpired | Push/email | hold expired, refund pending if any | immediately |
| PaymentFailed | App/push | amount, retry option, hold remaining | immediately |
| PaymentReceived | App/email | amount, payment reference, balance | immediately |
| BookingReminder | Push | start time/location, QR | before start, configurable |
| BookingChanged/Cancelled | Push/email | old/new details, refunds | immediately |
| BalanceDue | Push/app | remaining amount, allowed methods | venue policy |
| OrderAccepted/Ready | Push/app | order code, pickup or seat | status transition |
| OrderRefunded | App/email | amount/status | PSP confirm |
| SessionEndsSoon | Push | end time, extension availability | configurable |

## Rule
- Notifications are side effects, not source of truth. Client state comes from booking/order/payment APIs.
- No email/push containing raw payment credentials; personal data minimization.
- Notification preference opt-in where legally required; operational messages for contracts treated separately from marketing.
- Idempotent notification delivery per event/user/channel; dedupe and retry with dead-letter alert.

## Receipts
- Customer sees transaction list, booking payments, remaining due, refunds and venue receipt links if provided.
- GamerBooker payment confirmation is not automatically a legally valid invoice or cash register receipt; merchant responsibility [LEGAL-REVIEW].
- Support link per venue + central support; dispute process with ticket ID and attachments minimized.

## Incident UX
- `BOOKING_PENDING_PAYMENT`: show pending, no QR.
- `PAYMENT_CAPTURED_BOOKING_EXPIRED`: show refund in progress + contact support, no false confirmed booking.
- `VENUE_CLOSED_TEMP`: allow view/refund info, block booking creation.
- `RESOURCE_UNAVAILABLE`: reselect without charging; hold conflict handled transparently.
- `ORDER_UNAVAILABLE`: out-of-stock and refund/substitution confirmation.

## Telemetry
Per-screen funnel, rejection codes, payment failure rate, app-install conversion from on-site QR; privacy-preserving analytics and event versioning.
