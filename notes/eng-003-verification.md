# ENG-003 Verification - Multi-tenant Venue Schema, Memberships, Admin Onboarding, and Row Ownership

Status: Delivered and verified. ENG-003 closed.
Sources: handoff/HANDOFF-ENG-003.md, migrations/0004_venues_and_resources.sql,
src/venues/venues.service.ts, src/venues/venues.controller.ts,
tests/eng003-multi-tenant-venues.spec.ts.

Reviewer verdict: PASS.
- Double-booking: Exclusion constraints unaffected.
- Money from client: None accepted.
- Tenant isolation (T-018): Strictly verified. Cross-tenant reads and mutations return 404 RESOURCE_NOT_FOUND with identical bodies.
- Private room DAG: Composite containment enforced, cycles and self-containment rejected.
- RBAC permissions: OWNER/VENUE_MANAGER permitted to configure; RECEPTION read-only for floor resources; BAR_STAFF denied.

## What was built

1. **Database Schema (`migrations/0004_venues_and_resources.sql`)**:
   - Enhanced `tenants` and `venues` with billing profiles, publication states (`DRAFT`, `PENDING_APPROVAL`, `PUBLISHED`, `ARCHIVED`), slug, address, contact.
   - Created `rooms` (with venue-scoped unique name constraint and geometry metadata JSONB).
   - Created `zones` (with room-scoped unique name constraint and room/venue FKs).
   - Created `resources` (types `PC`, `CONSOLE_SETUP`, `PRIVATE_ROOM`, status `AVAILABLE`, `MAINTENANCE`, `TEMP_BLOCKED`).
   - Created `resource_components` (enforcing DAG composition, parent <> child constraint, venue co-locality).
   - Granted least-privilege DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) to `gamerbooker_app`.

2. **Application Layer (`src/venues/`)**:
   - `VenuesService`: transactional domain logic for tenants, venues, rooms, zones, resources, components, and staff memberships.
   - `VenuesController`:
     - Public routes: `GET /v1/venues` (published venues only).
     - Dashboard routes: `GET /v1/dashboard/venues/:venue_id`, `PATCH /v1/dashboard/venues/:venue_id`, rooms, zones, resources, components, and memberships.
     - Admin onboarding: `POST /v1/admin/tenants`, `POST /v1/admin/venues`.

3. **Acceptance Test Suite (`tests/eng003-multi-tenant-venues.spec.ts`)**:
   - Proves P0 case T-018: cross-tenant access to venues, rooms, zones, resources, and memberships is denied with 404 `RESOURCE_NOT_FOUND`.
   - Proves RBAC gates: RECEPTION receives 403 on write; BAR_STAFF receives 403 on equipment reads; OWNER can onboard and deactivate staff.
   - Proves private room DAG composition: self-containment and non-room parents rejected.
   - Proves publication scoping: DRAFT venues excluded from public browsing until set to PUBLISHED.

## Automated Gates Passed

- `npm run typecheck`: clean (0 errors)
- `npm run lint`: clean (0 errors)
- `npm run build`: clean (0 errors)
- `npm test`: 10 passed test suites, 167 passed tests, 4 todo, 0 failed.
