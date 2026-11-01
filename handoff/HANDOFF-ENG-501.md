# HANDOFF-ENG-501: Notifications, Templates, Receipts, and Order Status Flows

## 1. Goal & Architectural Scope
Delivers multi-channel notification dispatching, localized event templating, delivery idempotency, in-app notification inbox, customer booking receipts, and real-time order status tracking flows for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-501)
- `docs/07-mobile-app/02-notifications-and-support.md`
- `docs/08-api/02-events-idempotency-and-jobs.md`

Implements:
1. **Event Templating Engine**:
   - `TemplatesService` providing dynamic localization and formatting for all core lifecycle events:
     - `BOOKING_CONFIRMED`: Public code, venue name, interval timestamps, total/paid/balance breakdown, rolling check-in QR instructions.
     - `BOOKING_CANCELLED`: Public code, penalty/refund amounts, reason.
     - `BOOKING_REMINDER`: Imminent session alert (15m before start), station name, check-in instructions.
     - `ORDER_PLACED`: Crockford order number, estimated prep minutes SLA.
     - `ORDER_ACCEPTED`: Counter staff acceptance confirmation.
     - `ORDER_READY`: Split fulfillment instructions — Crockford pickup code for `BAR_PICKUP`, station delivery note for `AT_STATION`.
     - `ORDER_HANDED_OFF`: Completion note.
     - `ORDER_CANCELLED`: Cancellation reason and refund amount.
     - `PAYMENT_CAPTURED`: Payment receipt amount and reference.
     - `REFUND_SUCCEEDED`: Refund confirmation.
2. **Notification Dispatching & Delivery Idempotency**:
   - `NotificationsService.dispatch`:
   - Enforces operational message guarantee: transactional/contractual updates (`BOOKING_CONFIRMED`, `ORDER_READY`, etc.) are delivered regardless of marketing settings.
   - Respects marketing opt-in: non-contractual promotional alerts check `notification_preferences.marketing_opt_in`; skipped with `MARKETING_OPT_OUT` if not opted in.
   - Idempotent delivery protection: backed by `notification_deliveries` with a unique index on `(event_id, recipient_id, channel)`. Duplicate dispatches are deduplicated with `DUPLICATE_DELIVERY` status.
   - In-app delivery writes directly to `notifications` inbox table.
3. **In-App Notification Inbox & Preferences Management**:
   - `GET /v1/notifications`: Paginated in-app notifications with total count and unread count, supporting `unread_only` filter.
   - `PATCH /v1/notifications/:id/read`: Marks a single notification as read with ownership guard (`404 NOTIFICATION_NOT_FOUND`).
   - `POST /v1/notifications/read-all`: Batch marks all notifications for user as read.
   - `GET /v1/notifications/preferences`: Retrieves user notification settings.
   - `PUT /v1/notifications/preferences`: Updates user email/push/in-app toggles and marketing opt-in.
4. **Customer Booking Receipt View**:
   - `GET /v1/bookings/:id/receipt`:
   - Itemized financial receipt for customer reservation:
     - Header: Receipt number (`RCP-GB-XXXXXX`), issue timestamp, public booking code, session window.
     - Merchant entity: Venue name, tenant legal name, fiscal code (`RO-...`).
     - Line items: Station reservation or package details with duration and total.
     - Financial breakdown: Total minor, VAT (19% standard Romanian rate), subtotal, paid online, paid reception, total paid, balance due.
     - Itemized transactions: List of online captures (`ONLINE_CAPTURE`), desk cash/card payments (`RECEPTION_PAYMENT`), and completed refunds (`REFUND`).
     - Statutory legal disclaimer: OUG 28/1999 non-fiscal notice stating official fiscal receipts are issued at desk by the venue operator.
   - Strict customer ownership guard: foreign customers rejected with `404 BOOKING_NOT_FOUND`.
5. **Customer Order Status Flow Tracking**:
   - `GET /v1/orders/:id/status-flow`:
   - Real-time milestone tracker:
     - Sequential milestones: `PLACED` -> `ACCEPTED` -> `PREPARING` -> `READY` -> `HANDED_OFF` (and `CANCELLED` if applicable).
     - Accurate `reached` and `active` flags reflecting order lifecycle progress.
     - Pickup code surfaced for `BAR_PICKUP` orders; target station name surfaced for `AT_STATION` orders.
   - Strict customer ownership guard: foreign customers rejected with `404 ORDER_NOT_FOUND`.

## 2. Domain Invariants & Rules
1. **Side-Effect Independence**:
   - Notifications are side effects, not sources of truth. Booking/order/payment states are derived strictly from their domain aggregates.
2. **Delivery Deduplication**:
   - An event cannot be delivered more than once to the same recipient on the same channel (`(event_id, recipient_id, channel)` uniqueness).
3. **Statutory Fiscal Transparency**:
   - Online confirmation receipts clearly distinguish booking contractual records from Romanian OUG 28/1999 fiscal receipts.

## 3. Database Schema
Migration `migrations/0029_notifications_and_receipts.sql`:
- Created `notification_preferences`:
  - `user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in, created_at, updated_at`
- Created `notifications`:
  - `id, tenant_id, user_id, event_type, title, body, channel, metadata, read, read_at, created_at`
  - Index on `(user_id, read, created_at DESC)`
- Created `notification_deliveries`:
  - `id, event_id, recipient_id, channel, event_type, template_key, status, payload, error_message, sent_at, created_at`
  - Unique index `uq_notification_deliveries_event_recipient_channel` on `(event_id, recipient_id, channel)`
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/notifications` (Customer / Staff Inbox)
- `PATCH /v1/notifications/:id/read` (Customer / Staff Inbox)
- `POST /v1/notifications/read-all` (Customer / Staff Inbox)
- `GET /v1/notifications/preferences` (User Preferences)
- `PUT /v1/notifications/preferences` (User Preferences)
- `POST /v1/notifications/dispatch` (Notification Dispatcher)
- `GET /v1/bookings/:id/receipt` (Customer Booking Receipt)
- `GET /v1/orders/:id/status-flow` (Customer Order Tracker)

## 5. Acceptance Verification Plan
Automated integration test suite `tests/eng501-notifications-and-receipts.spec.ts`:
- **Templates & Formatting**: Verifies template outputs for booking confirmations, cancellations, reminders, order milestones, payments, and refunds.
- **Dispatching & Idempotency**: Proves dispatching to in-app inbox, duplicate suppression (`status: 'SKIPPED'`, `reason: 'DUPLICATE_DELIVERY'`), and marketing opt-in gating.
- **Inbox & Preferences**: Proves listing with unread counts, single-item mark read, mark-all read, ownership guards, and preferences persistence.
- **Booking Receipt**: Proves itemization, transaction aggregation (online PSP + reception cash), VAT calculation, OUG 28/1999 notice, and 404 security guard.
- **Order Status Flow**: Proves linear milestone progression across bar board actions (`PLACED` -> `ACCEPTED` -> `PREPARING` -> `READY` -> `HANDED_OFF`), pickup code visibility, and 404 security guard.
