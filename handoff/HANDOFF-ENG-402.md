# HANDOFF-ENG-402: Cart, Checkout, Preorders, and In-Session Order Eligibility

## 1. Goal & Architectural Scope
Delivers the reservation-first order management, cart validation, preorders, in-session ordering eligibility, atomic stock reservation, payment capture, and cancellation stock release for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-402)
- `docs/06-consumables/01-menu-stock-and-products.md`
- `docs/06-consumables/02-order-lifecycle-and-fulfillment.md`

Implements:
1. **Reservation-First Architecture & Eligibility Engine**:
   - `POST /v1/orders/cart/validate`: Validates booking linkage, session timing, fulfillment mode, station targeting, and item availability.
   - Preorder vs In-Session classification: Future confirmed bookings (`now < starts_at`) are classified as `PREORDER`. Checked-in sessions or bookings currently active within `starts_at - 15m` to `ends_at - 15m` are classified as `IN_SESSION`.
   - Ordering window cutoff: In-session ordering closes 15 minutes before session ends (`ends_at - 15m`).
   - Ownership & authorization: Orders are strictly bound to the booking owner or confirmed group participants (`403 FORBIDDEN_BOOKING_ACCESS`). Cancelled or completed bookings reject orders (`400 BOOKING_NOT_ELIGIBLE_FOR_ORDERS`).
2. **Fulfillment Modes & Station Targeting**:
   - `AT_STATION`: Requires `target_resource_id` matching one of the resources assigned to the booking. Rejects unassigned stations (`400 INVALID_CART_CONTENTS`).
   - `BAR_PICKUP`: Generates a Crockford base32 pickup code (`PK-XXXX`) for counter redemption.
3. **Order Placement & Atomic Stock Reservation**:
   - `POST /v1/orders/checkout`: Validates cart and acquires PostgreSQL row locks (`SELECT ... FOR UPDATE`) on target products in sorted order to prevent deadlocks.
   - Atomically increments `stock_reserved` on inventory-tracked products and records `RESERVATION_HOLD` in `stock_movements`.
   - Rejects orders where requested quantity exceeds available stock (`400 INSUFFICIENT_STOCK`).
   - Creates a PSP payment intent for `total_minor` and links `payment_intent_id` and Crockford public code (`ORD-XXXXXX`).
4. **Order Payment Webhook & Confirmation**:
   - `POST /v1/orders/payments/capture`: Webhook capture handler transitioning order status from `PAYMENT_PENDING` to `PLACED`. Idempotent for duplicate webhook deliveries.
5. **Order Cancellation & Stock Release**:
   - `POST /v1/orders/:id/cancel`: Customer or staff cancellation releasing reserved stock back to available pool (`RESERVATION_RELEASE` movement). Rejects cancellation if already handed off (`400 ORDER_ALREADY_HANDED_OFF`).
6. **Order Queries & Dashboard Metrics**:
   - `GET /v1/orders`: Customer listing of their own orders.
   - `GET /v1/orders/:id`: Customer/staff order detail retrieval with ownership guard (`403 FORBIDDEN`).
   - `GET /v1/dashboard/venues/:venue_id/orders`: Staff order ledger with revenue metrics and status breakdown (`OWNER`, `VENUE_MANAGER`, `RECEPTION`).
   - Cross-venue isolation enforced between distinct venues.

## 2. Domain Invariants & Rules
1. **Reservation Dependency**:
   - An order cannot exist without a valid, non-cancelled, non-completed `booking_id`.
2. **Stock Reservation Invariant**:
   - `stock_available = stock_on_hand - stock_reserved`
   - Placing an order increments `stock_reserved` by order quantity; cancelling releases it.
3. **Audit & Outbox Integrity**:
   - Emits transactional outbox events: `OrderPlaced`, `OrderConfirmed`, `OrderCancelled`.
   - Emits append-only audit events: `ORDER_CHECKOUT_INITIATED`, `ORDER_PAID_AND_PLACED`, `ORDER_CANCELLED`.

## 3. Database Schema
Migration `migrations/0025_orders_and_order_items.sql`:
- `orders`: `id, public_code, tenant_id, venue_id, booking_id, customer_id, order_type, fulfillment_mode, target_resource_id, pickup_code, status, total_minor, currency, payment_intent_id, age_verified_by, age_verified_at, cancellation_reason, notes, created_at, updated_at`.
- `order_items`: `id, order_id, product_id, title, unit_price_minor, quantity, line_total_minor, restricted_product_type, age_verification_required, tax_category, created_at`.
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `POST /v1/orders/cart/validate` (Customer)
- `POST /v1/orders/checkout` (Customer)
- `POST /v1/orders/payments/capture` (Webhook simulation)
- `GET /v1/orders` (Customer)
- `GET /v1/orders/:id` (Customer)
- `POST /v1/orders/:id/cancel` (Customer)
- `GET /v1/dashboard/venues/:venue_id/orders` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `GET /v1/dashboard/venues/:venue_id/orders/:id` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/cancel` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)

## 5. Acceptance Verification Plan
Suite `tests/eng402-cart-checkout-and-preorders.spec.ts` (12/12 passed):
1. Classifies future confirmed booking order as `PREORDER` and calculates line totals.
2. Classifies checked-in booking as `IN_SESSION` and validates `AT_STATION` target resource.
3. Rejects `AT_STATION` fulfillment when target station is not assigned to booking.
4. Prohibits another customer from ordering on a booking they do not own (`403 FORBIDDEN_BOOKING_ACCESS`).
5. Rejects ordering when cart quantity exceeds available stock.
6. Places order, generates pickup code for `BAR_PICKUP`, reserves stock, and creates PSP intent.
7. Captures order payment webhook and transitions order status to `PLACED`.
8. Cancels pending order and atomically releases reserved stock back to pool.
9. Allows customer to list their own orders.
10. Allows venue staff to list venue orders with revenue summary metrics.
11. Prohibits customer from accessing another customer order (`403 FORBIDDEN`).
12. Enforces cross-venue boundary: Venue B staff cannot access Venue A orders.
