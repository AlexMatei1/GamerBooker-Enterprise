# HANDOFF-ENG-403: Bar Board State Machine & Order Handoff Station/Pickup

## 1. Goal & Architectural Scope
Delivers the operator bar board queue, order preparation state machine, staff handoff fulfillment (station delivery & counter pickup code verification), Law 42/2024 age verification enforcement at fulfillment, atomic stock decrement, and order rejection with automatic compensating refund for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-403)
- `docs/06-consumables/02-order-lifecycle-and-fulfillment.md`
- `docs/06-consumables/03-compliance-and-reporting.md`

Implements:
1. **Bar Board Queue & Operator Dashboard**:
   - `GET /v1/dashboard/venues/:venue_id/bar-board`: Real-time queue of active consumable orders (`PLACED`, `ACCEPTED`, `PREPARING`, `READY`).
   - Metrics aggregation: summary counts (`placed_count`, `accepted_count`, `preparing_count`, `ready_count`, `overdue_count`).
   - SLA tracking: calculates remaining minutes against preparation SLA (`estimated_prep_minutes`, default 15 min), dynamically tagging orders as `ON_TRACK` or `OVERDUE`.
   - Filters: supports filtering by `fulfillment_mode` (`AT_STATION`, `BAR_PICKUP`) and `status`.
2. **Order Lifecycle State Machine**:
   - Strict linear state progression: `PLACED -> ACCEPTED -> PREPARING -> READY -> HANDED_OFF`.
   - Rejects illegal state jumps (e.g. attempting to accept an already accepted order or jumping directly to ready) with `400 INVALID_ORDER_STATE`.
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/accept`: Records `accepted_by` and `accepted_at`.
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/prepare`: Records `prepared_by` and `prepared_at`.
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/ready`: Records `ready_at`.
3. **Counter Handoff & Pickup Code Verification**:
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/handoff`:
   - For `BAR_PICKUP` orders: mandatory Crockford pickup code validation (`input.pickup_code`). Case-insensitive comparison against `orders.pickup_code`. Mismatch rejects with `400 INVALID_PICKUP_CODE`.
4. **Law 42/2024 Compliance & Age Verification at Handoff**:
   - Inspects line items for `age_verification_required = true` (alcohol, energy drinks).
   - If restricted items are present, requires `input.age_verified = true`. If omitted or false, rejects handoff with `400 AGE_VERIFICATION_REQUIRED`.
   - On successful verification, records `age_verified_by` (staff ID) and `age_verified_at` (timestamp) on the order record and audit log.
5. **Atomic Stock Deduction on Fulfillment**:
   - Upon transition to `HANDED_OFF`, atomizes inventory fulfillment:
     - Decrements `products.stock_on_hand` and `products.stock_reserved` by item quantity.
     - Inserts `stock_movements` ledger entry with type `ORDER_DEDUCT`, negative quantity delta, and updated balance after.
   - Idempotency guard: if order is already `HANDED_OFF`, returns existing order state without double-deducting inventory.
6. **Order Rejection & Compensating Refund**:
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/reject`:
   - Mandatory non-empty rejection reason (`400 MISSING_REJECTION_REASON`).
   - Releases reserved stock back to available pool (`RESERVATION_RELEASE` movement).
   - Automatically initiates compensating refund via `RefundsService.requestRefund` for the full captured order amount (`total_minor`).
   - Sets order status to `CANCELLED` with `cancellation_reason`.
7. **Role-Based Access Control & Cross-Venue Isolation**:
   - Restricted to venue staff (`OWNER`, `VENUE_MANAGER`, `RECEPTION`).
   - Customer tokens rejected (`404 RESOURCE_NOT_FOUND`).
   - Cross-venue isolation: staff from Venue B cannot query or update orders for Venue A.

## 2. Domain Invariants & Rules
1. **Fulfillment Invariant**:
   - `stock_on_hand` is only deducted when the product physically leaves the bar (`HANDED_OFF`).
   - `stock_reserved` is released simultaneously with the `stock_on_hand` deduction to keep `stock_available = stock_on_hand - stock_reserved` consistent.
2. **Law 42/2024 Compliance Invariant**:
   - No order containing age-restricted consumables can reach `HANDED_OFF` without an authenticated staff member attesting age verification.
3. **Audit & Outbox Integrity**:
   - Emits transactional outbox events: `OrderAccepted`, `OrderPreparing`, `OrderReady`, `OrderHandedOff`, `OrderRejected`.
   - Emits append-only audit events: `ORDER_ACCEPTED`, `ORDER_PREPARING`, `ORDER_READY`, `ORDER_HANDED_OFF`, `ORDER_REJECTED_REFUND_TRIGGERED`.

## 3. Database Schema
Migration `migrations/0026_bar_board_and_order_lifecycle.sql`:
- Extended `orders`:
  - `accepted_by uuid REFERENCES users(id)`
  - `accepted_at timestamptz`
  - `prepared_by uuid REFERENCES users(id)`
  - `prepared_at timestamptz`
  - `ready_at timestamptz`
  - `handed_off_by uuid REFERENCES users(id)`
  - `handed_off_at timestamptz`
  - `estimated_prep_minutes integer NOT NULL DEFAULT 15`
- Added partial index `orders_bar_board_queue_idx` on `(venue_id, status, created_at ASC)` for active statuses `('PLACED', 'ACCEPTED', 'PREPARING', 'READY')`.
- Granted least-privilege `SELECT, UPDATE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/bar-board` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/accept` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/prepare` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/ready` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/handoff` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/reject` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)

## 5. Acceptance Verification Plan
Automated end-to-end integration test suite `tests/eng403-bar-board-and-handoff.spec.ts`:
- **Bar Board Queue View**: Verifies queue grouping, status metrics, and SLA calculation (`ON_TRACK` / `OVERDUE`).
- **Order State Machine Lifecycle**: Verifies `PLACED -> ACCEPTED -> PREPARING -> READY` transitions and invalid transition rejection (`400 INVALID_ORDER_STATE`).
- **Counter Handoff & Pickup Code**: Verifies invalid pickup code rejection (`400 INVALID_PICKUP_CODE`), successful code matching, and atomic inventory deduction (`stock_on_hand` and `stock_reserved` decremented, `ORDER_DEDUCT` movement logged).
- **Station Handoff & Age Verification**: Verifies rejection without age verification (`400 AGE_VERIFICATION_REQUIRED`), successful handoff with `age_verified: true`, and audit logging.
- **Order Rejection & Compensating Refund**: Verifies staff rejection, reserved stock release (`RESERVATION_RELEASE`), order status `CANCELLED`, and automatic refund issuance.
- **Authorization & Security**: Customer 404 block and multi-tenant cross-venue boundaries.
