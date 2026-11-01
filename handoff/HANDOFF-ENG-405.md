# HANDOFF-ENG-405: Booking Packages with Atomic Availability & Stock Validation

## 1. Goal & Architectural Scope
Delivers bundled booking packages combining workstation hours with consumable products (energy drinks, snacks, VIP lounge perks) under atomic multi-resource availability checks and inventory reservations for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-405)
- `docs/06-consumables/01-menu-stock-and-products.md`
- `docs/06-consumables/02-order-lifecycle-and-fulfillment.md`
- `docs/04-bookings/01-reservation-lifecycle.md`

Implements:
1. **Package Catalog Configuration & Discovery**:
   - `packages` and `package_items` schema with multi-tenant venue scoping.
   - Package setup with required resource type (`PC`, `CONSOLE_SETUP`, `PRIVATE_ROOM`), duration minutes, price, prepaid mode (`FULL` or `DEPOSIT`), and included consumable products with quantities.
   - `POST /v1/dashboard/venues/:venue_id/packages`: Staff creates packages (`OWNER`, `VENUE_MANAGER`).
   - `PUT /v1/dashboard/venues/:venue_id/packages/:id`: Staff updates name, description, duration, price, active state.
   - `DELETE /v1/dashboard/venues/:venue_id/packages/:id`: Prevents deletion if future active bookings exist (`409 PACKAGE_HAS_ACTIVE_BOOKINGS`).
   - `GET /v1/venues/:venue_id/packages`: Public discovery endpoint displaying active packages with included products and real-time available consumable stock.
   - `GET /v1/venues/:venue_id/packages/:id`: Public single-package details.
2. **Atomic Availability Checks & Package Quotes**:
   - `POST /v1/venues/:venue_id/packages/:id/quote`:
   - Validates resource matching: workstation must match the package required `resource_type` (`400 INVALID_RESOURCE_FOR_PACKAGE`).
   - Verifies consumable stock availability: every included tracked product must have available stock (`stock_on_hand - stock_reserved >= quantity`). Rejects immediately if stock is exhausted (`400 PACKAGE_PRODUCT_OUT_OF_STOCK`).
   - Checks workstation slot overlap via `resource_claims` exclusion logic.
   - Issues a cryptographically signed HMAC quote (`QuoteResult`) embedding `package_id`, duration, and fixed package price.
3. **Atomic Hold & Consumable Stock Reservation**:
   - `POST /v1/holds`: Holding a package quote atomically locks the physical workstation (via GiST exclusion claims) AND increments `stock_reserved` for each included consumable product in `products`.
   - Records audit movement `RESERVATION_HOLD` in `stock_movements`.
   - Releasing the hold (`POST /v1/holds/:id/release`) or expiry cleanup releases the workstation claims AND decrements `stock_reserved` (`RESERVATION_RELEASE`).
4. **Booking Confirmation & Automatic Pre-Order Provisioning**:
   - `POST /v1/bookings/confirm`:
   - Converts hold into confirmed booking with `package_id` attached.
   - Automatically provisions a linked pre-order in `orders` (`fulfillment_mode = 'AT_STATION'`, `status = 'PLACED'`, `target_resource_id = pcId`) and creates `order_items` for every package product line item at 0 incremental charge (already covered by package price).
   - Generates unique customer pickup code (`order_number`).
   - Automatically surfaces on venue Bar Board queue (`GET /v1/dashboard/venues/:venue_id/bar-board`) for preparation and station delivery.
5. **Authorization & Multi-Tenant Boundaries**:
   - Public customer access for package listing and quoting.
   - Venue dashboard package management restricted to `OWNER` and `VENUE_MANAGER`.
   - Reception staff restricted from creating/editing packages (`403 AUTH_ROLE_NOT_PERMITTED`).
   - Customer tokens rejected from dashboard endpoints (`404 RESOURCE_NOT_FOUND`).
   - Cross-venue isolation strictly enforced.

## 2. Domain Invariants & Rules
1. **Atomic Availability Invariant**:
   - A package cannot be quoted or held if either the workstation slot is claimed OR any included consumable product has insufficient available stock (`stock_on_hand - stock_reserved < required`).
2. **Stock Reservation & Release Symmetry**:
   - Package holds reserve inventory upfront. If the hold expires or is cancelled, inventory is immediately returned to the available pool.
   - On confirmation, the reserved stock transitions to a placed order for bar board preparation and fulfillment.
3. **Audit & Outbox Integrity**:
   - Emits transactional outbox events: `PackageCreated`, `PackageUpdated`, `PackageDeleted`, `HoldCreated`, `HoldReleased`, `BookingConfirmed`, `OrderPlaced`.

## 3. Database Schema
Migration `migrations/0028_booking_packages.sql`:
- Created `packages`:
  - `id, tenant_id, venue_id, name, description, resource_type, duration_minutes, price_minor, currency, prepaid_mode, deposit_amount_minor, active, created_at, updated_at`
- Created `package_items`:
  - `id, package_id, product_id, quantity, created_at`
  - Unique constraint on `(package_id, product_id)`
- Extended `price_quotes`: added `package_id uuid REFERENCES packages(id)`
- Extended `holds`: added `package_id uuid REFERENCES packages(id)`
- Extended `bookings`: added `package_id uuid REFERENCES packages(id)`
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/venues/:venue_id/packages` (Public)
- `GET /v1/venues/:venue_id/packages/:id` (Public)
- `POST /v1/venues/:venue_id/packages/:id/quote` (Customer / Public)
- `POST /v1/dashboard/venues/:venue_id/packages` (`OWNER`, `VENUE_MANAGER`)
- `PUT /v1/dashboard/venues/:venue_id/packages/:id` (`OWNER`, `VENUE_MANAGER`)
- `DELETE /v1/dashboard/venues/:venue_id/packages/:id` (`OWNER`, `VENUE_MANAGER`)
- `POST /v1/holds` (holds workstation + reserves package consumable stock)
- `POST /v1/holds/:id/release` (frees workstation + releases package consumable stock)
- `POST /v1/bookings/confirm` (confirms booking + provisions linked pre-order for Bar Board)

## 5. Acceptance Verification Plan
Automated integration test suite `tests/eng405-booking-packages.spec.ts`:
- **Package Configuration & Discovery**: Creates package with workstation requirements and consumables, validates pricing/duration constraints, public discovery lists active packages with stock, staff updates package details.
- **Atomic Availability & Stock Validation on Quotes**: Valid quote creation when resource & consumables available, rejection on resource type mismatch (`400 INVALID_RESOURCE_FOR_PACKAGE`), rejection on consumable stockout (`400 PACKAGE_PRODUCT_OUT_OF_STOCK`).
- **Package Atomic Hold & Stock Reservation**: Hold atomically reserves workstation and increments `stock_reserved` with `RESERVATION_HOLD`; hold release immediately decrements `stock_reserved` with `RESERVATION_RELEASE`.
- **Package Confirmation & Bar Board Provisioning**: Confirming package booking automatically provisions linked pre-order visible on Bar Board; package deletion blocked when future bookings exist (`409 PACKAGE_HAS_ACTIVE_BOOKINGS`).
- **Authorization & Security**: Customer 404 guard, Reception 403 guard on package management, cross-venue boundary enforcement.
