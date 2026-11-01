# HANDOFF-ENG-203: Free-form Geometry Scene, Editor Layers Tools, Multi-Room and Presets

## 1. Goal & Architectural Scope
Delivers the complete backend scene data model, draft persistence, multi-room layout geometry, layer management, optimistic revision concurrency, and standard preset template generation for GamerBooker Enterprise v1.0 Visual Layout Builder, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-203)
- `docs/05-venue-dashboard/02-visual-layout-builder.md`

## 2. Domain Invariants & Rules
1. **Scene Model & Geometric Free-Form Separation**:
   - Visual geometry represents presentation only; moving stations does not modify resource identity or booking history.
   - Canvas enforces positive coordinate boundaries (`width >= 200`, `height >= 200`, `grid >= 1`).
   - Rooms support geometric polygon/rect shapes with immutable `room_id` references.
   - Scene nodes support structural kinds (`WALL`, `DOOR`, `DECOR`, `FURNITURE`, `RESOURCE`, `LABEL`) categorized across 5 configurable layers (`background`, `walls`, `furniture`, `equipment`, `labels`).
2. **Optimistic Concurrency & Revision Guard**:
   - Every draft update requires `expected_revision`.
   - If `expected_revision !== current.revision`, the transaction aborts with `409 LAYOUT_REVISION_CONFLICT`.
   - On successful update, revision increments atomically (`revision = revision + 1`).
3. **Draft Auto-Initialization & Baseline Seeding**:
   - First-time query for a venue draft automatically populates baseline room bounds and places existing DB equipment nodes so venue owners do not face a blank canvas.
   - `POST /v1/dashboard/venues/:id/layout/draft/reset` re-synchronizes draft from database rooms and resources.
4. **Preset Templates Catalog & Generator Engine**:
   - Parametric node generators for standard esports and gaming arrangements:
     - `ROW_PCS`: Linear station bank with desks, chairs, and incremental station numbering (`PC-01` .. `PC-20`).
     - `ESPORTS_5V5`: Two opposing mirrored team stages (`TEAM BLUE` vs `TEAM RED`) with 180° rotation on Team 2.
     - `CONSOLE_LOUNGE`: Leather couch, coffee table, TV console stand, and console setup node.
     - `VIP_U_SHAPE`: Executive U-shaped pod with 90°/270° wing orientation.
     - `PRIVATE_ROOM`: Enclosed perimeter walls, RFID keycard entry door, VIP suite resource node, and interior PCs.
5. **Audit & Outbox**:
   - Appends audit logs to `audit_events` (`action = 'LAYOUT_DRAFT_UPDATED' | 'LAYOUT_DRAFT_RESET'`, `request_id` tracked).
   - Publishes transactional `outbox_events` (`event_type = 'LayoutDraftUpdated'`).

## 3. Database Schema
Defined in `migrations/0017_layout_scenes.sql`:
- `layout_drafts`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE UNIQUE`
  - `revision int NOT NULL DEFAULT 1`
  - `schema_version int NOT NULL DEFAULT 1`
  - `canvas jsonb NOT NULL DEFAULT '{"width": 1600, "height": 1000, "grid": 20}'::jsonb`
  - `rooms jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `layers jsonb NOT NULL DEFAULT '[...]'::jsonb`
  - `nodes jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - `updated_by uuid REFERENCES users(id) ON DELETE SET NULL`
- Privileges granted to least-privilege `gamerbooker_app` role.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/layout/draft`
  - Returns current draft scene or auto-initializes baseline draft from venue rooms/resources.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `PUT /v1/dashboard/venues/:venue_id/layout/draft`
  - Updates draft scene with optimistic concurrency control (`expected_revision`).
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `POST /v1/dashboard/venues/:venue_id/layout/draft/reset`
  - Resets draft back to revision 1 baseline from database.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `GET /v1/dashboard/venues/:venue_id/layout/presets`
  - Returns catalog of available layout templates.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `POST /v1/dashboard/venues/:venue_id/layout/presets/generate`
  - Generates template nodes given coordinates, offset, counts, and room ID.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.

## 5. Acceptance Verification Plan
Suite `tests/eng203-layout-scene-and-layers.spec.ts` (15/15 passed):
1. Draft auto-initializes seeded with existing venue rooms and resources.
2. Reception staff can read draft in read-only mode.
3. Cross-tenant access is rejected with `404 RESOURCE_NOT_FOUND`.
4. Updating draft bumps revision from 1 to 2, persists walls/doors/decor/furniture, and logs audit/outbox events.
5. Stale revision update rejected with `409 LAYOUT_REVISION_CONFLICT`.
6. Reception role rejected from updating draft with `403 AUTH_ROLE_NOT_PERMITTED`.
7. Schema validation rejects negative room coordinates (`400 INVALID_ROOM_COORDINATES`).
8. Schema validation rejects negative node coordinates (`400 NEGATIVE_NODE_COORDINATES`).
9. Schema validation rejects duplicate node IDs in scene (`400 DUPLICATE_NODE_ID`).
10. Schema validation rejects invalid canvas width (`400 INVALID_CANVAS_WIDTH`).
11. Catalog lists all 5 preset templates.
12. Generates `ROW_PCS` preset with desks, chairs, and bounding box.
13. Generates `ESPORTS_5V5` preset with mirrored teams, opposing desks, and 180° rotation.
14. Generates `PRIVATE_ROOM` preset with perimeter walls, entry door, and interior stations.
15. Draft reset restores baseline revision 1 seeded from database.
