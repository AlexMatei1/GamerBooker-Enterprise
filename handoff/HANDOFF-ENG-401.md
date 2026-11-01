# HANDOFF-ENG-401: Product/Menu Category, Image Upload, Pricing, and Stock Tracking

## 1. Goal & Architectural Scope
Delivers the consumables catalog, product categorization, pricing, regulatory age-restriction enforcement (Law 42/2024), image asset handling, and audit-logged inventory stock tracking for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-401)
- `docs/06-consumables/01-menu-stock-and-products.md`
- `docs/06-consumables/02-order-lifecycle-and-fulfillment.md`

Implements:
1. **Menu Categories Lifecycle**:
   - `GET /v1/venues/:venue_id/menu/categories` (public, active only)
   - `GET /v1/dashboard/venues/:venue_id/menu/categories` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
   - `POST /v1/dashboard/venues/:venue_id/menu/categories` (`OWNER`, `VENUE_MANAGER`)
   - `PATCH /v1/dashboard/venues/:venue_id/menu/categories/:id` (`OWNER`, `VENUE_MANAGER`)
   - `DELETE /v1/dashboard/venues/:venue_id/menu/categories/:id` (`OWNER`, `VENUE_MANAGER`)
   - Case-insensitive category name uniqueness per venue (`409 CATEGORY_NAME_EXISTS`).
2. **Product Catalog & Regulatory Enforcement**:
   - `GET /v1/venues/:venue_id/menu/products` (public catalog)
   - `GET /v1/dashboard/venues/:venue_id/menu/products` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
   - `GET /v1/dashboard/venues/:venue_id/menu/products/:id` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
   - `POST /v1/dashboard/venues/:venue_id/menu/products` (`OWNER`, `VENUE_MANAGER`)
   - `PATCH /v1/dashboard/venues/:venue_id/menu/products/:id` (`OWNER`, `VENUE_MANAGER`)
   - `DELETE /v1/dashboard/venues/:venue_id/menu/products/:id` (`OWNER`, `VENUE_MANAGER`)
   - Strict validation: positive minor price (`400 INVALID_PRODUCT_PRICE`), title required (`400 MISSING_PRODUCT_TITLE`), unique SKU per venue (`409 SKU_ALREADY_EXISTS`).
   - Law 42/2024 compliance: if `restricted_product_type` is `ENERGY_DRINK` or `ALCOHOL`, `age_verification_required` is automatically enforced as `true`.
3. **Inventory & Stock Movement Ledger**:
   - `POST /v1/dashboard/venues/:venue_id/menu/products/:id/adjust-stock` (`OWNER`, `VENUE_MANAGER`)
   - `GET /v1/dashboard/venues/:venue_id/menu/products/:id/stock-history` (`OWNER`, `VENUE_MANAGER`, `RECEPTION`)
   - Append-only ledger `stock_movements` tracking every change (`INITIAL_STOCK`, `RESTOCK`, `ADJUSTMENT`, `DAMAGE_WASTE`, etc.) with `quantity_delta`, `balance_after`, actor, and timestamp.
   - Non-negative invariant: stock adjustments cannot result in negative stock (`400 STOCK_CANNOT_BE_NEGATIVE`) or reduce stock below currently reserved units (`400 INSUFFICIENT_STOCK_FOR_ADJUSTMENT`).
4. **Bulk Product Import**:
   - `POST /v1/dashboard/venues/:venue_id/menu/products/bulk-import` (`OWNER`, `VENUE_MANAGER`)
   - Dry-run validation mode (`dry_run: true`) checking batch duplicates and DB SKU collisions without persisting.
   - Atomic apply creating products, auto-creating missing categories, and logging initial stock movements in a single transaction.
5. **Image Asset Management**:
   - `POST /v1/dashboard/venues/:venue_id/menu/products/upload-image` (`OWNER`, `VENUE_MANAGER`)
   - Supports absolute HTTP/S URLs or base64 uploads (JPEG, PNG, WebP) with mime validation (`400 INVALID_IMAGE_TYPE`).
6. **Security & RBAC**:
   - Customer public browsing vs manager mutation boundaries.
   - Reception staff has read-only access to menu/stock; barred from mutations (`403 AUTH_ROLE_NOT_PERMITTED`).
   - Non-members receive `404 RESOURCE_NOT_FOUND` on dashboard endpoints.
   - Cross-venue isolation enforced between distinct venues.

## 2. Domain Invariants & Rules
1. **Stock Availability Invariant**:
   - `stock_available = max(0, stock_on_hand - stock_reserved)`
   - Adjustments must maintain `stock_on_hand >= stock_reserved` and `stock_on_hand >= 0`.
2. **Regulatory Restrictive Typing**:
   - Products typed `ENERGY_DRINK` or `ALCOHOL` cannot be set with `age_verification_required = false`.
3. **SKU Uniqueness**:
   - Unique per venue: `UNIQUE (venue_id, lower(sku)) WHERE sku IS NOT NULL`.

## 3. Database Schema
Migration `migrations/0024_consumables_catalog_and_stock.sql`:
- `menu_categories`: `id, tenant_id, venue_id, name, description, sort_order, active, created_at, updated_at`.
- `products`: `id, tenant_id, venue_id, category_id, sku, title, description, image_url, price_minor, currency, tax_category, active, inventory_tracking, stock_on_hand, stock_reserved, min_qty, max_qty, preparation_minutes, fulfillment_methods, restricted_product_type, age_verification_required, created_at, updated_at`.
- `stock_movements`: `id, tenant_id, venue_id, product_id, movement_type, quantity_delta, balance_after, actor_id, actor_role, reference, notes, created_at`.
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/venues/:venue_id/menu/categories`
- `GET /v1/venues/:venue_id/menu/products`
- `GET /v1/venues/:venue_id/menu/products/:id`
- `GET /v1/dashboard/venues/:venue_id/menu/categories`
- `POST /v1/dashboard/venues/:venue_id/menu/categories`
- `PATCH /v1/dashboard/venues/:venue_id/menu/categories/:id`
- `DELETE /v1/dashboard/venues/:venue_id/menu/categories/:id`
- `GET /v1/dashboard/venues/:venue_id/menu/products`
- `GET /v1/dashboard/venues/:venue_id/menu/products/:id`
- `POST /v1/dashboard/venues/:venue_id/menu/products`
- `PATCH /v1/dashboard/venues/:venue_id/menu/products/:id`
- `DELETE /v1/dashboard/venues/:venue_id/menu/products/:id`
- `POST /v1/dashboard/venues/:venue_id/menu/products/:id/adjust-stock`
- `GET /v1/dashboard/venues/:venue_id/menu/products/:id/stock-history`
- `POST /v1/dashboard/venues/:venue_id/menu/products/bulk-import`
- `POST /v1/dashboard/venues/:venue_id/menu/products/upload-image`

## 5. Acceptance Verification Plan
Suite `tests/eng401-menu-catalog-and-stock.spec.ts` (18/18 passed):
1. Allows venue manager to create menu category and enforces unique name per venue.
2. Allows updating category details and rejects duplicate name on update (`409 CATEGORY_NAME_EXISTS`).
3. Returns active categories on public endpoint and all categories on dashboard.
4. Creates product with initial stock and automatically enforces age verification for energy drinks (Law 42/2024).
5. Rejects duplicate SKU within the same venue (`409 SKU_ALREADY_EXISTS`).
6. Rejects invalid price (`400 INVALID_PRODUCT_PRICE`) or missing product title (`400 MISSING_PRODUCT_TITLE`).
7. Allows updating product price, description, and fulfillment methods.
8. Archives/deletes a product by setting active to false.
9. Records initial stock movement upon product creation.
10. Allows restock and records `RESTOCK` movement.
11. Allows wastage deduction and rejects adjustment below zero or reserved stock (`400 STOCK_CANNOT_BE_NEGATIVE`).
12. Performs dry-run validation identifying duplicate SKUs without persisting.
13. Atomically imports valid batch and auto-creates missing categories.
14. Registers an absolute image URL.
15. Generates asset URL for base64 image and rejects invalid mime types (`400 INVALID_IMAGE_TYPE`).
16. Prohibits customer from modifying menu or adjusting stock (`404 RESOURCE_NOT_FOUND`).
17. Prohibits reception staff from creating products or adjusting stock (`403 AUTH_ROLE_NOT_PERMITTED`).
18. Enforces cross-venue boundary: Venue B staff cannot modify Venue A products.
