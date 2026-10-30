# REST API contract — baseline v1

## API design
Prefix `/v1`; JSON; OAuth/OIDC bearer token client, JWT audience verified, RBAC per request; `X-Request-Id` trace; `Idempotency-Key` required for mutations involving holds/payment/orders; `If-Match` for config publishing. Response errors conform to stable `code`, `message`, `details`, `request_id`.

## Endpoint catalog
| Method | Route | Caller | Operation |
|---|---|---|---|
| GET | `/venues` | customer | browse/search published |
| GET | `/venues/{id}` | customer | venue metadata and settings summary |
| GET | `/venues/{id}/layout` | customer | published scene & room list |
| GET | `/venues/{id}/availability?from=&to=` | customer | available resources/time, advisory |
| POST | `/quotes` | customer | server-calculated time/resource quote |
| POST | `/holds` | customer | transactionally reserve temp inventory |
| GET | `/holds/{id}` | customer owner | hold status/TTL |
| POST | `/holds/{id}/participants` | organizer | split amounts/invitation before payment freeze |
| POST | `/holds/{id}/checkout` | payer/organizer | create payment intents |
| GET | `/bookings/{id}` | booking member/authorized staff | confirmed status/snapshot |
| GET | `/me/bookings` | customer | upcoming and history |
| POST | `/bookings/{id}/cancel-quote` | booking payer | cancellation amount preview |
| POST | `/bookings/{id}/cancel` | authorized customer | transactional cancellation |
| POST | `/bookings/{id}/change-quote` | booking payer | reschedule estimate |
| POST | `/bookings/{id}/change` | customer | atomic reschedule with payment |
| POST | `/bookings/{id}/extend` | customer | extension quote/checkout |
| POST | `/bookings/{id}/balance-intent` | payer | pay remaining online |
| GET | `/venues/{id}/menu` | customer | products, stock status, modes |
| POST | `/orders/quote` | booking participant | basket validation |
| POST | `/orders` | booking participant | create and pay order |
| GET | `/orders/{id}` | customer/order staff | order state |
| POST | `/staff/bookings/{id}/checkin` | reception | validate QR, mark check-in |
| POST | `/staff/bookings/{id}/checkout` | reception | session completion |
| POST | `/staff/bookings/{id}/offline-receipts` | authorized staff | record actual cash/card receipt |
| POST | `/staff/orders/{id}/transition` | bar staff | prepare/ready/handoff |
| GET | `/dashboard/venues/{id}/bookings` | venue staff | operational calendar |
| GET/POST | `/dashboard/venues/{id}/resources` | owner/manager | configure equipment |
| GET/POST | `/dashboard/venues/{id}/layouts/drafts` | layout editor | work on draft |
| POST | `/dashboard/venues/{id}/layouts/publish` | owner/manager | validate and atomically publish |
| GET/PUT | `/dashboard/venues/{id}/policies` | owner/manager | versioned settings |
| GET/POST | `/dashboard/venues/{id}/products` | catalog manager | product management |
| POST | `/webhooks/payments/{provider}` | PSP | signed webhook, no user auth |
| GET | `/platform/venues` | platform admin | onboarding/moderation |

## Example 1: create quote
```http
POST /v1/quotes
Authorization: Bearer <token>
Content-Type: application/json

{
  "venue_id": "<venue-uuid>",
  "resource_ids": ["<pc-uuid-1>", "<pc-uuid-2>"],
  "starts_at": "2026-11-06T18:00:00Z",
  "ends_at": "2026-11-06T20:00:00Z",
  "participants": 2
}
```
```json
{
  "quote_id": "<quote-uuid>",
  "expires_at": "2026-11-06T17:45:00Z",
  "currency": "RON",
  "total_minor": 8000,
  "due_now_minor": 3200,
  "balance_minor": 4800,
  "policy": {"deposit_percent": 40, "free_cancel_minutes": 180, "min_minutes": 60, "balance_methods": ["ONLINE", "RECEPTION"]},
  "items": [{"resource_id": "<pc-uuid-1>", "amount_minor": 4000}, {"resource_id": "<pc-uuid-2>", "amount_minor": 4000}]
}
```
**Example only:** timestamps and pricing are illustrative; no implicit live availability.

## Example 2: create hold
```http
POST /v1/holds
Idempotency-Key: 0280d019-1f48-4cc2-83ca-5f2f2a851d83
Authorization: Bearer <token>
Content-Type: application/json

{"quote_id": "<quote-uuid>", "mode": "SPLIT_BY_PARTICIPANT"}
```
```json
{"hold_id":"<hold-uuid>","status":"ACTIVE","expires_at":"2026-11-06T17:55:00Z","amount_due_minor":3200}
```

## Example 3: payments and staff
`POST /v1/holds/{id}/checkout` body `{"payer_mode":"SPLIT_BY_PARTICIPANT"}` returns each participant’s provider client secrets scoped to payer. No provider secret given to organizer for another participant. `POST /v1/staff/bookings/{id}/offline-receipts` only with proper role and real receipt data.

## HTTP error catalog
- `400 VALIDATION_ERROR`; `401 AUTH_REQUIRED`; `403 FORBIDDEN`; `404 RESOURCE_NOT_FOUND` (avoid tenant leaks); `409 RESOURCE_UNAVAILABLE|VERSION_CONFLICT|ALREADY_CHECKED_IN|BALANCE_CHANGED`; `410 HOLD_EXPIRED|QUOTE_EXPIRED`; `422 POLICY_NOT_SATISFIED|CAPACITY_EXCEEDED|PAYMENT_REQUIRED`; `429 RATE_LIMITED`; `503 PROVIDER_UNAVAILABLE`.

## Client behavior
- No silent retry for non-idempotent writes without key; same key returns identical previous outcome (or accepted in-progress), different payload under same key rejected.
- `GET` lists cursor paginated, filter by tenant/venue access; zero exposure of PSP secrets, PAN/CVV, other payer personal data.
