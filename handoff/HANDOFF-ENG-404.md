# HANDOFF-ENG-404: Age Restrictions Refusal, Unavailable Item Refunds & Physical Stock Reconciliation

## 1. Goal & Architectural Scope
Delivers regulatory age verification refusal workflows (Law 42/2024 compliance), line-item partial refunds for unavailable/damaged items during order prep, and physical stock reconciliation auditing with discrepancy tracking and inventory ledger alignment for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-404)
- `docs/06-consumables/01-menu-stock-and-products.md`
- `docs/06-consumables/02-order-lifecycle-and-fulfillment.md`

Implements:
1. **Law 42/2024 Age Verification Refusal Flow**:
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/refuse-age`:
   - Handles customer refusal or failure to provide legal age proof at station delivery or bar counter pickup.
   - Granular item-level refusal: supports refusing specific age-restricted line items (`line_item_ids`).
   - Atomically releases reserved inventory (`RESERVATION_RELEASE` movement).
   - Updates item status to `REFUSED_AGE_RESTRICTION` with `refund_id`, `refunded_amount_minor`, and staff audit reason.
   - Automatically triggers compensating partial refund via `RefundsService.requestRefund`.
   - Leaves unrestricted items in the order `ACTIVE`, allowing the customer to fulfill and receive the remaining items.
   - Guard rails: rejects attempts to refuse items that are not age-restricted (`400 ITEM_NOT_AGE_RESTRICTED`), or orders with no active age-restricted items (`400 NO_AGE_RESTRICTED_ITEMS`).
   - Automatic cascade: if all items in an order are refused, automatically transitions the order to `CANCELLED`.
2. **Line Item Cancellation & Unavailable Product Refunds**:
   - `POST /v1/dashboard/venues/:venue_id/orders/:id/items/:item_id/cancel-unavailable`:
   - Handles product stock discrepancies, kitchen equipment failures, or spoilage discovered after payment capture.
   - Mandatory cancellation reason (`400 MISSING_CANCELLATION_REASON`).
   - Releases item's reserved stock back to the inventory pool (`RESERVATION_RELEASE`).
   - Issues automatic compensating partial refund for `line_total_minor` via `RefundsService.requestRefund`.
   - Updates line item status to `REFUNDED_UNAVAILABLE`.
   - Prevents duplicate cancellation on already refunded items (`400 ITEM_ALREADY_CANCELLED`).
   - If all items in the order become unavailable, the order status transitions automatically to `CANCELLED`.
3. **Physical Stock Reconciliation Ledger & Discrepancy Auditing**:
   - Schema: `stock_reconciliation_audits` and `stock_reconciliation_items` tables.
   - `POST /v1/dashboard/venues/:venue_id/menu/stock-reconciliation`:
     - Staff conducts periodic physical counts across products.
     - Compares counted stock against system `stock_on_hand` to detect shrinkage (negative delta) or surplus (positive delta).
     - Directly updates `products.stock_on_hand` to verified physical inventory.
     - Records audit movements in `stock_movements`: `DAMAGE_WASTE` for shrinkage, `ADJUSTMENT` for surplus.
     - Computes penny-accurate financial shrinkage value (`total_shrinkage_value_minor`) based on product unit price minor.
   - `GET /v1/dashboard/venues/:venue_id/menu/stock-reconciliation`: lists historical reconciliation audits with pagination.
   - `GET /v1/dashboard/venues/:venue_id/menu/stock-reconciliation/:id`: retrieves itemized breakdown with expected vs actual counts and financial variances.
4. **Authorization & Cross-Venue Security**:
   - Refusal & line item cancellation restricted to venue staff (`OWNER`, `VENUE_MANAGER`, `RECEPTION`).
   - Stock reconciliation mutation restricted to managers (`OWNER`, `VENUE_MANAGER`); reception rejected with `403 AUTH_ROLE_NOT_PERMITTED`.
   - Customer tokens rejected (`404 RESOURCE_NOT_FOUND`).
   - Cross-venue isolation strictly enforced: staff from Venue B cannot view or modify Venue A reconciliations.

## 2. Domain Invariants & Rules
1. **Law 42/2024 Refusal Invariant**:
   - Age check failure on restricted items never penalizes or blocks fulfillment of valid non-restricted items in the same cart.
2. **Stock Consistency Invariant**:
   - Refusing or cancelling line items immediately releases `stock_reserved` (`GREATEST(0, stock_reserved - qty)`) and records `RESERVATION_RELEASE`.
   - In subsequent handoffs, only `ACTIVE` items are deducted from `stock_on_hand`.
3. **Audit & Outbox Integrity**:
   - Emits transactional outbox events: `OrderAgeVerificationRefused`, `OrderItemRefundedUnavailable`, `StockReconciliationCompleted`.
   - Emits append-only audit events: `ORDER_AGE_VERIFICATION_REFUSED`, `ORDER_ITEM_REFUNDED_UNAVAILABLE`, `STOCK_RECONCILIATION_COMPLETED`.

## 3. Database Schema
Migration `migrations/0027_order_item_refunds_and_stock_reconciliation.sql`:
- Extended `order_items`:
  - `status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REFUNDED_UNAVAILABLE', 'REFUSED_AGE_RESTRICTION'))`
  - `refund_id uuid REFERENCES refunds(id)`
  - `refunded_amount_minor bigint NOT NULL DEFAULT 0`
  - `refund_reason text`
  - `refunded_at timestamptz`
- Created `stock_reconciliation_audits`:
  - `id, tenant_id, venue_id, performed_by, items_counted, discrepancy_items_count, total_discrepancy_units, total_shrinkage_value_minor, notes, status, created_at, completed_at`
- Created `stock_reconciliation_items`:
  - `id, audit_id, product_id, expected_stock, counted_stock, discrepancy_quantity, discrepancy_value_minor, adjustment_type, notes, created_at`
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `POST /v1/dashboard/venues/:venue_id/orders/:id/refuse-age` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/orders/:id/items/:item_id/cancel-unavailable` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `POST /v1/dashboard/venues/:venue_id/menu/stock-reconciliation` (`OWNER`, `VENUE_MANAGER`)
- `GET /v1/dashboard/venues/:venue_id/menu/stock-reconciliation` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
- `GET /v1/dashboard/venues/:venue_id/menu/stock-reconciliation/:id` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)

## 5. Acceptance Verification Plan
Automated integration test suite `tests/eng404-age-refusal-item-refunds-and-stock-reconciliation.spec.ts`:
- **Age Verification Refusal**: Partial refusal releases stock, refunds restricted line item, and permits handoff of non-restricted items; non-restricted item refusal returns `400 ITEM_NOT_AGE_RESTRICTED`; full order cancels when all items are refused.
- **Unavailable Item Refunds**: Kitchen out-of-stock cancellation triggers compensating refund, updates item to `REFUNDED_UNAVAILABLE`, and prevents duplicate cancels (`400 ITEM_ALREADY_CANCELLED`).
- **Physical Stock Reconciliation**: Reconciles physical counts against ledger, records `DAMAGE_WASTE` and `ADJUSTMENT` movements, computes shrinkage value, and allows historical query.
- **Security Boundaries**: Customer 404 guard, Reception 403 write guard on reconciliation, and cross-venue isolation.
