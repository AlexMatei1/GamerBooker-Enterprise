# HANDOFF - ENG-003 Multi-tenant venue schema, memberships, admin onboarding, row ownership tests

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:9 (ENG-003),
critical path line 54. M0 requires multi-tenant isolation and row ownership tests
(docs/11-delivery/01-implementation-roadmap.md).

Preconditions:
- ENG-001 (Foundation) and ENG-002 (Auth core, sessions, MFA, RBAC substrate) delivered.
- Test suites passing against local PostgreSQL with least-privilege `gamerbooker_app` role.

## Scope

Deliver the complete multi-tenant venue and resource hierarchy, venue onboarding workflow,
staff membership lifecycle, and robust cross-tenant row ownership verification.

Grounded in:
- docs/02-architecture/02-data-model.md:7-16 (tenants, venues, rooms, zones, resources, memberships)
- docs/05-venue-dashboard/01-dashboard-modules-and-navigation.md:13-14, 49-53 (venue profile, multi-location, data-driven config)
- docs/05-venue-dashboard/04-roles-onboarding-and-audit.md:1-46 (RBAC matrix, onboarding wizard, staff management, audit trail)
- docs/08-api/01-api-contracts.md:7-10, 35, 41 (`/venues`, `/venues/{id}`, `/dashboard/venues/{id}/resources`, `/platform/venues`)
- docs/09-security/01-security-and-privacy.md:4-10 (BOLA/IDOR defense, server validates identity, role, tenant scope and ownership on EVERY object)
- docs/10-testing/01-test-strategy-and-acceptance.md:33 (T-018 Cross-tenant resource ID access denied)

## In Scope

1. **Schema Migration (`migrations/0004_venues_and_resources.sql`)**:
   - `tenants` (id, legal_name, billing_profile jsonb, state, created_at, updated_at).
   - `venues` (id, tenant_id, name, slug, timezone, address jsonb, publication_state, contact jsonb, created_at, updated_at).
   - `rooms` (id, venue_id, name, geometry_metadata jsonb, created_at, updated_at).
   - `zones` (id, room_id, venue_id, name, policy_profile_id uuid null, created_at, updated_at).
   - `resources` (id, venue_id, room_id, zone_id, type ENUM 'PC', 'CONSOLE_SETUP', 'PRIVATE_ROOM', name, attributes jsonb, bookable boolean, status text, created_at, updated_at).
   - `resource_components` (parent_resource_id, child_resource_id, venue_id) ensuring DAG relationships for private rooms and children.
   - Composite foreign keys and triggers enforcing strict venue & tenant co-locality.
2. **Onboarding & Management API**:
   - Platform Admin / Tenant Owner onboarding: `POST /v1/admin/tenants`, `POST /v1/admin/venues`.
   - Venue profile & status management: `GET /v1/dashboard/venues/:venue_id`, `PATCH /v1/dashboard/venues/:venue_id`.
   - Rooms & Zones CRUD: `POST /v1/dashboard/venues/:venue_id/rooms`, `POST /v1/dashboard/venues/:venue_id/zones`.
   - Resource CRUD: `GET /v1/dashboard/venues/:venue_id/resources`, `POST /v1/dashboard/venues/:venue_id/resources`, `PATCH /v1/dashboard/venues/:venue_id/resources/:resource_id`.
   - Staff management: `GET /v1/dashboard/venues/:venue_id/memberships`, `POST /v1/dashboard/venues/:venue_id/memberships`, `PATCH /v1/dashboard/venues/:venue_id/memberships/:membership_id`.
   - Public customer read: `GET /v1/venues` (published only), `GET /v1/venues/:venue_id` (public published profile summary).
3. **Multi-Tenant Row Ownership & Authorization Guard**:
   - Server-side object scoping: every query filters by `venue_id` and the caller's validated tenant.
   - Anti-BOLA: accessing a resource, room, zone, or membership belonging to another tenant or venue yields 404 `RESOURCE_NOT_FOUND` (indistinguishable from non-existent).
   - Role gates: OWNER and VENUE_MANAGER can configure; RECEPTION has read-only access; BAR_STAFF has no catalog configuration access.

## Out of Scope (Deferred)

- Visual Layout Builder Canvas (geometry editor / layers / draft/publish revisions): ENG-203..205.
- Pricing policy calculation engine & rate rules: ENG-102 & ENG-103.
- Physical exclusion constraints and hold locking: ENG-104 & ENG-004.
- PSP connection & payout verification: ENG-005.

## Decisions

| Id | Decision | Rationale | Reversibility |
|---|---|---|---|
| D14 | Every sub-resource (`rooms`, `zones`, `resources`, `resource_components`) carries `venue_id` and has composite foreign keys. | Guarantees database-level enforcement that no zone or resource can reference a room of a different venue or tenant. | High cost to reverse |
| D15 | Cross-tenant access to ANY entity strictly returns 404 `RESOURCE_NOT_FOUND` rather than 403 `FORBIDDEN`. | In line with OWASP API Security and D9: prevents resource ID enumeration and tenant leakage across tenants. | Reversible |
| D16 | Public endpoints (`/v1/venues`, `/v1/venues/:venue_id`) only expose venues in `PUBLISHED` state and strip internal staff/billing metadata. | Safeguards tenant business configurations until official venue launch. | Reversible |
| D17 | Resource components DAG constraint: a PRIVATE_ROOM can contain PC or CONSOLE_SETUP children in the same venue; cycles and self-containment are rejected by DB constraint. | Satisfies composite resource availability requirements in docs/02-architecture/02-data-model.md:39. | Reversible |

## Acceptance Tests (ENG-003)

- **ENG003-T01 (T-018 Row Ownership)**: User A (Tenant 1) attempts to query, update, or delete a room, zone, or resource belonging to Tenant 2 using valid UUIDs -> Returns 404 `RESOURCE_NOT_FOUND`.
- **ENG003-T02 (RBAC Venue Configuration)**: OWNER and VENUE_MANAGER can create/update resources; RECEPTION gets 403 `AUTH_ROLE_NOT_PERMITTED` on write operations; BAR_STAFF gets 403 on reads.
- **ENG003-T03 (Resource & Room Hierarchy)**: Creating a resource with a `room_id` or `zone_id` belonging to a different venue or tenant fails with 400/404 foreign key violation.
- **ENG003-T04 (Composite Resource DAG)**: Attempting to add a parent as its own child or create cyclic resource containment fails constraint validation.
- **ENG003-T05 (Staff Membership Lifecycle)**: Owner can onboard staff to a venue with assigned role; deactivating a membership immediately revokes venue access.
- **ENG003-T06 (Public vs Draft Venue Scoping)**: Draft or unpublished venues appear in dashboard for authorized staff, but are excluded from public `/v1/venues` search.
