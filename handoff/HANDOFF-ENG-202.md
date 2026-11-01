# HANDOFF-ENG-202: Resource CRUD and Bulk Clone/Import

## 1. Goal & Architectural Scope
Implements comprehensive resource lifecycle management, active booking deletion guard, bulk cloning with sequential template naming, bulk status transitions, and bulk import for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-202)
- `docs/05-venue-dashboard/01-dashboard-modules-and-navigation.md`
- `docs/05-venue-dashboard/02-visual-layout-builder.md`

## 2. Domain Invariants & Rules
1. **Active Booking Deletion Guard**:
   - A resource cannot be deleted if it has active holds (`state = 'ACTIVE_HOLD'`) or confirmed bookings (`state = 'CONFIRMED'`) where `upper(slot) > now()` (`409 RESOURCE_HAS_ACTIVE_BOOKINGS`).
   - Operators wishing to take equipment offline must update status to `'MAINTENANCE'` or `'TEMP_BLOCKED'` or set `bookable = false`.
2. **Bulk Clone Deadlock Prevention & Unique Naming**:
   - Sequential naming generation: `prefix + String(i).padStart(padLength, '0')` (e.g. `PC-01` to `PC-20`).
   - Maximum batch limit: 100 resources per operation to avoid excessive memory and lock duration.
   - Name collision pre-check: All generated names are checked against `resources_venue_name_uniq` in the venue. Any conflict returns `409 RESOURCE_NAME_EXISTS`.
3. **Bulk Update Atomic Scoping**:
   - All `resource_ids` must belong to the caller's authorized `venue_id` (404 on any foreign or missing ID).
   - Resources are locked and updated in sorted lexicographical UUID order to prevent deadlocks under concurrent batch requests.
4. **Audit & Traceability**:
   - All lifecycle modifications write append-only records to `audit_events` with `actor_id`, `actor_role`, `target_type = 'RESOURCE'`, `target_id`, `action`, and `request_id`.
   - Emits transactional `outbox_events` (`ResourceCreated`, `ResourceUpdated`, `ResourceDeleted`, `ResourcesBulkCreated`, `ResourcesBulkUpdated`).

## 3. Database Schema
Uses existing `resources` and `resource_components` tables (`migrations/0004_venues_and_resources.sql`) and `resource_claims` (`migrations/0005_exclusion_constraints.sql` & `0011_holds.sql`).

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/resources/:id`
  - Retrieves single resource detail with room/zone and component references.
- `PATCH /v1/dashboard/venues/:venue_id/resources/:id`
  - Updates resource metadata (`name`, `status`, `bookable`, `room_id`, `zone_id`, `attributes`).
- `DELETE /v1/dashboard/venues/:venue_id/resources/:id`
  - Deletes resource if no active or future claims exist. Rejects with `409 RESOURCE_HAS_ACTIVE_BOOKINGS` otherwise.
- `POST /v1/dashboard/venues/:venue_id/resources/bulk-clone`
  - Body: `{ template: { type, roomId?, zoneId?, attributes?, bookable?, status? }, naming: { prefix, startIndex, count, padLength } }`.
  - Atomically creates up to 100 resources.
- `PATCH /v1/dashboard/venues/:venue_id/resources/bulk-update`
  - Body: `{ resource_ids: string[], updates: { status?, bookable?, roomId?, zoneId?, attributes? } }`.
  - Updates multiple resources atomically in sorted order.
- `POST /v1/dashboard/venues/:venue_id/resources/bulk-import`
  - Body: `{ items: Array<{ name, type, roomId?, zoneId?, attributes?, bookable?, status? }> }`.
  - Batch imports heterogeneous equipment catalog items.

## 5. Acceptance Verification Plan
Suite `tests/eng202-resource-crud-and-bulk.spec.ts`:
1. Resource CRUD: create, read, update name/attributes/status.
2. Deletion guard: deleting a resource with active future booking is blocked with 409 `RESOURCE_HAS_ACTIVE_BOOKINGS`.
3. Deletion succeeds when no active or future claims exist.
4. Bulk clone creates 10 resources sequentially named `PC-01` through `PC-10` with matching template attributes.
5. Bulk clone rejects if generated name already exists (409 `RESOURCE_NAME_EXISTS`).
6. Bulk clone rejects count > 100 (400 `BATCH_SIZE_EXCEEDED`).
7. Bulk update transitions multiple resources to `'MAINTENANCE'` and `bookable: false`.
8. Bulk update rejects with 404 `RESOURCE_NOT_FOUND` if any resource ID belongs to another venue/tenant.
9. Bulk import creates heterogeneous items (PCs and console setups) in a single atomic transaction.
10. RBAC: `OWNER` and `VENUE_MANAGER` can perform resource operations; `RECEPTION` cannot modify (403 `AUTH_ROLE_NOT_PERMITTED`).
