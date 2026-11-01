# HANDOFF-ENG-204: Resource Inspector, Adjacency Edges, and Private Room Composition

## 1. Goal & Architectural Scope
Delivers the complete resource inspector metadata engine, smart seat proximity adjacency graph, and DAG private room composition editing for GamerBooker Enterprise v1.0 Visual Layout Builder, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-204)
- `docs/05-venue-dashboard/02-visual-layout-builder.md`

## 2. Domain Invariants & Rules
1. **Resource Inspector & Hierarchy Resolution**:
   - Fetches complete resource metadata: ID, name, equipment category, status, bookability, room name, zone name, hardware attributes/specs.
   - Computes effective hourly pricing by evaluating strict precedence (`RESOURCE` > `ZONE` > `VENUE_DEFAULT` > `PLATFORM_DEFAULT`).
   - Computes effective policy profile (`ZONE` > `VENUE_DEFAULT` > Platform Defaults).
   - Resolves composite hierarchy: child components (if private room) and parent rooms (if member station).
   - Surfaces direct physical adjacency neighbors with distance metric weights.
   - Resource updates validate room/zone venue ownership and enforce uniqueness of resource names within the venue (`409 RESOURCE_NAME_EXISTS`).
2. **Adjacency Edges (Smart Seat Graph)**:
   - Stations do not automatically inherit booking adjacency from visual placement alone; adjacency edges must be explicitly confirmed for the Smart Seat grouping algorithm.
   - Undirected graph representation enforced via canonical ordered pair (`CHECK (resource_a_id < resource_b_id)` and `UNIQUE (venue_id, resource_a_id, resource_b_id)`).
   - Rejects self-adjacencies (`400 SELF_ADJACENCY_PROHIBITED`) and foreign resources (`404 RESOURCE_NOT_FOUND`).
   - Proximity suggestion engine calculates 2D Euclidean distances across layout draft station nodes within the same room and suggests distance metrics (1 for <= 90 units, 2 for <= 140 units, 3 for <= 180 units).
3. **Private Room Composition Editing**:
   - Private room resources (`type = 'PRIVATE_ROOM'`) define composite collections of atomic equipment (`resource_components`).
   - Rejects attempts to edit composition on non-private-room resources (`400 INVALID_RESOURCE_TYPE`).
   - Prohibits self-containment (`400 SELF_CONTAINMENT_PROHIBITED`).
   - Prevents DAG circular dependencies (`400 DAG_CYCLE_DETECTED`).
   - Atomic replacement of child component sets within an audited database transaction.
4. **Audit & Traceability**:
   - Logs modifications to `audit_events` (`RESOURCE_INSPECTOR_UPDATED`, `ADJACENCY_CREATED`, `ADJACENCY_DELETED`, `PRIVATE_ROOM_COMPOSITION_UPDATED`).
   - Emits transactional `outbox_events` (`ResourceUpdated`, `AdjacencyCreated`, `AdjacencyDeleted`, `PrivateRoomCompositionUpdated`).

## 3. Database Schema
Defined in `migrations/0018_resource_adjacencies.sql` and `migrations/0004_venues_and_resources.sql`:
- `resource_adjacencies`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
  - `resource_a_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE`
  - `resource_b_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE`
  - `distance_metric int NOT NULL DEFAULT 1 CHECK (distance_metric >= 1)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `CONSTRAINT resource_adjacencies_no_self CHECK (resource_a_id <> resource_b_id)`
  - `CONSTRAINT resource_adjacencies_ordered_pair CHECK (resource_a_id < resource_b_id)`
  - `CONSTRAINT resource_adjacencies_pair_uniq UNIQUE (venue_id, resource_a_id, resource_b_id)`
- `resource_components`:
  - `parent_resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE`
  - `child_resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- Grants to least-privilege `gamerbooker_app` role.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/resources/:id/inspector`
  - Returns inspector detail with resolved pricing, policy, specs, and adjacencies.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `PATCH /v1/dashboard/venues/:venue_id/resources/:id/inspector`
  - Updates resource metadata, room, zone, and attributes.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `GET /v1/dashboard/venues/:venue_id/adjacencies`
  - Lists all adjacency edges in venue.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `POST /v1/dashboard/venues/:venue_id/adjacencies`
  - Creates or updates adjacency edge between two stations.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `DELETE /v1/dashboard/venues/:venue_id/adjacencies/:id`
  - Removes adjacency edge.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `GET /v1/dashboard/venues/:venue_id/adjacencies/suggest?max_proximity=`
  - Computes candidate edges based on layout draft coordinates within the same room.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.
- `GET /v1/dashboard/venues/:venue_id/private-rooms/:id/composition`
  - Returns current child components for private room.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`, `RECEPTION`.
- `PUT /v1/dashboard/venues/:venue_id/private-rooms/:id/composition`
  - Atomically sets child resources for private room.
  - Allowed roles: `OWNER`, `VENUE_MANAGER`.

## 5. Acceptance Verification Plan
Suite `tests/eng204-resource-inspector-and-adjacencies.spec.ts` (17/17 passed):
1. Inspector returns complete resolved pricing, policy, and hardware specs.
2. Updates inspector metadata and writes audit/outbox entries.
3. Rejects rename collision with 409 `RESOURCE_NAME_EXISTS`.
4. Creates adjacency edge and reflects neighbor in inspector view.
5. Normalizes reversed pair order and updates distance metric on conflict without duplication.
6. Rejects self-adjacency with 400 `SELF_ADJACENCY_PROHIBITED`.
7. Rejects cross-tenant adjacency resource with 404 `RESOURCE_NOT_FOUND`.
8. Lists all venue adjacencies.
9. Suggests candidate adjacencies based on layout draft Euclidean proximity.
10. Deletes adjacency edge and clears neighbor relationship.
11. Retrieves empty private room composition initially.
12. Updates composition with child stations and links parent to child inspector.
13. Rejects self-containment with 400 `SELF_CONTAINMENT_PROHIBITED`.
14. Rejects composition editing on PC with 400 `INVALID_RESOURCE_TYPE`.
15. Rejects circular DAG composition between private rooms with 400 `DAG_CYCLE_DETECTED`.
16. Prevents reception staff from mutating inspector or composition (403 `AUTH_ROLE_NOT_PERMITTED`).
17. Enforces cross-tenant isolation returning 404 `RESOURCE_NOT_FOUND`.
