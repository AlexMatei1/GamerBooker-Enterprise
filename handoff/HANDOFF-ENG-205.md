# HANDOFF-ENG-205: Draft/Revision/Publish/Preview Validation and Rollback

## 1. Goal & Architectural Scope
Delivers the complete layout publication lifecycle, pre-publication validation engine, active booking deletion guard, atomic immutable revisions, customer preview with real-time occupancy status, and linear non-destructive rollback for GamerBooker Enterprise v1.0 Visual Layout Builder, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-205)
- `docs/05-venue-dashboard/02-visual-layout-builder.md`

## 2. Domain Invariants & Rules
1. **Pre-publication Validation Engine**:
   - Validates positive canvas boundaries (`width >= 200`, `height >= 200`).
   - Ensures room integrity and non-negative geometric coordinates.
   - Requires valid `resource_id` for every equipment node.
   - Rejects duplicate resource node placements in the scene (`DUPLICATE_RESOURCE_IN_SCENE`).
   - Verifies all referenced resources exist in the caller's authorized venue (`RESOURCE_NOT_FOUND`).
   - Warns on missing pricing rules falling back to platform defaults.
2. **Active Booking Deletion Guard (Crucial Domain Rule)**:
   - When publishing or rolling back, any resource previously in the published layout that is removed, set to maintenance, or made non-bookable is checked for future commitments.
   - If that resource has future confirmed bookings (`CONFIRMED`) or active holds (`ACTIVE_HOLD`) with `upper(slot) > now()`, publication is strictly rejected with `400 LAYOUT_VALIDATION_FAILED` (`DELETED_RESOURCE_HAS_FUTURE_BOOKINGS`).
   - Prevents operators from inadvertently or maliciously deleting stations that clients have already reserved.
3. **Atomic Immutable Revisions**:
   - Publishing converts draft into an immutable record in `layout_revisions` with a sequential `revision_number`.
   - Protects against concurrent editor overwrites via `expected_draft_revision` (`409 LAYOUT_REVISION_CONFLICT`).
   - Updates `venues.active_layout_revision_id` in the same audited database transaction.
   - Emits transactional `outbox_events` (`LayoutPublished`) and `audit_events` (`LAYOUT_PUBLISHED`).
4. **Customer 2D Layout Preview**:
   - Renders customer-facing 2D scene map from either active published layout (`draft=false`) or working draft (`draft=true`).
   - Resolves effective prices (minor units) and currencies for each station.
   - Queries overlapping `resource_claims` during the requested sample interval:
     - `MAINTENANCE` claims or out-of-order equipment -> `'MAINTENANCE'`.
     - Confirmed bookings or active holds -> `'BOOKED'`.
     - Idle stations -> `'AVAILABLE'`.
   - Computes summary availability metrics for customer consumption.
5. **Linear Non-Destructive Rollback**:
   - Rolling back to an earlier revision (e.g., from rev 2 back to rev 1) creates a **NEW** sequential revision (rev 3) containing the historical layout contents.
   - Preserves complete linear audit history without mutating or deleting historical records.
   - Validates that the rollback target does not violate the active booking guard before applying.
   - Automatically re-synchronizes the working draft to the rolled-back state.
   - Emits `audit_events` (`LAYOUT_ROLLBACK_PUBLISHED`) and `outbox_events` (`LayoutRollbackPublished`).

## 3. Database Schema
Defined in `migrations/0019_layout_published_revisions.sql`:
- `layout_revisions`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
  - `revision_number int NOT NULL`
  - `schema_version int NOT NULL DEFAULT 1`
  - `canvas jsonb NOT NULL`
  - `rooms jsonb NOT NULL`
  - `layers jsonb NOT NULL`
  - `nodes jsonb NOT NULL`
  - `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `published_at timestamptz NOT NULL DEFAULT now()`
  - `published_by uuid REFERENCES users(id) ON DELETE SET NULL`
  - `change_summary text`
  - `CONSTRAINT layout_revisions_venue_rev_uniq UNIQUE (venue_id, revision_number)`
- `venues.active_layout_revision_id uuid REFERENCES layout_revisions(id) ON DELETE SET NULL`.
- Grants to least-privilege `gamerbooker_app` role.

## 4. API Specification
- `POST /v1/dashboard/venues/:venue_id/layout/validate`
  - Validates working draft without publishing.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `POST /v1/dashboard/venues/:venue_id/layout/publish`
  - Atomically validates and publishes draft to a new immutable revision.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `POST /v1/dashboard/venues/:venue_id/layout/rollback`
  - Creates a new revision based on a target historical revision.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `GET /v1/dashboard/venues/:venue_id/layout/revisions`
  - Lists all published revisions with active status.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `GET /v1/dashboard/venues/:venue_id/layout/preview?draft=&from=&to=`
  - Customer-facing layout preview with real-time occupancy status.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.

## 5. Acceptance Verification Plan
Suite `tests/eng205-layout-publish-and-rollback.spec.ts` (13/13 passed):
1. Pre-publication validator validates correct draft with resource/room counts.
2. Detects duplicate resource node bindings (`DUPLICATE_RESOURCE_IN_SCENE`).
3. Detects foreign or unowned resource references (`RESOURCE_NOT_FOUND`).
4. Atomically publishes draft to revision 1 and points venue active revision pointer.
5. Rejects publication when expected draft revision is stale (409 `LAYOUT_REVISION_CONFLICT`).
6. Active booking guard rejects publishing a layout that deletes a resource with future bookings (`DELETED_RESOURCE_HAS_FUTURE_BOOKINGS`).
7. Returns customer preview with resolved pricing and real-time occupancy status (`BOOKED` vs `AVAILABLE`).
8. Preview supports working draft layout mode.
9. Publishes revision 2, then rolls back to revision 1 creating immutable revision 3 and updating active pointer.
10. Rejects rollback to non-existent revision with 404 `REVISION_NOT_FOUND`.
11. Lists all published revisions with `is_active` correctly designated.
12. Prevents reception staff from publishing or rolling back (403 `AUTH_ROLE_NOT_PERMITTED`).
13. Enforces cross-tenant isolation returning 404 `RESOURCE_NOT_FOUND`.
