# HANDOFF-ENG-201: Venue Setup Wizard, Staff Invitation & Permissions

## 1. Goal & Architectural Scope
Implements the Venue Onboarding / Setup Wizard, Publication Gates Validator, Staff Invitation Workflow, and Multi-Tenant RBAC Permissions for GamerBooker Enterprise v1.0, satisfying requirements from:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-201)
- `docs/05-venue-dashboard/01-dashboard-modules-and-navigation.md`
- `docs/05-venue-dashboard/04-roles-onboarding-and-audit.md`

## 2. Domain Invariants & Rules
1. **Onboarding Wizard Step Aggregation**:
   - `step_details`: Venue name, timezone, address, contact defined.
   - `step_rooms_zones`: At least 1 physical room and 1 zone linked to the venue.
   - `step_resources`: At least 1 active, bookable resource (`PC`, `CONSOLE_SETUP`, `PRIVATE_ROOM`).
   - `step_schedules`: At least 1 active weekly operating schedule.
   - `step_pricing_policies`: At least 1 default policy profile and at least 1 price rule.
   - `step_staff`: At least 1 active staff member (`OWNER`).
2. **Publication Gates Enforcement**:
   - A venue in `DRAFT` or `PENDING_APPROVAL` cannot transition to `PUBLISHED` if any P0 gate is missing (`400 PUBLISH_GATE_FAILED`).
   - Publication transitions emit `VenuePublished` to `outbox_events` and log append-only entries to `audit_events`.
   - Archiving or unpublishing a venue with future confirmed bookings requires explicit resolution or is flagged.
3. **Staff Invitation Security (RFC/Token Standards)**:
   - Invitation tokens are generated as 32-byte cryptographically secure random values (64 hex characters).
   - Only the SHA-256 hash (`bytea`) is stored in `staff_invitations`; the plaintext token is never stored.
   - Tokens have a strict 72-hour time-to-live (`expires_at = now() + 72 hours`).
   - Single-use redemption: accepting consumes the invitation atomically (`status = 'ACCEPTED'`), preventing replay.
   - RBAC delegation: `OWNER` can invite any role (`OWNER`, `VENUE_MANAGER`, `RECEPTION`, `BAR_STAFF`). `VENUE_MANAGER` can invite operational staff (`RECEPTION`, `BAR_STAFF`) but cannot elevate users to `OWNER` or `VENUE_MANAGER` (`403 ROLE_ELEVATION_NOT_PERMITTED`). Operational staff cannot invite anyone (`403 AUTH_ROLE_NOT_PERMITTED`).
   - Last owner protection: Venue cannot deactivate or remove its last active `OWNER` (`400 CANNOT_REMOVE_LAST_OWNER`).

## 3. Database Schema (`migrations/0015_staff_invitations.sql`)
- Table `staff_invitations`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
  - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `email text NOT NULL`
  - `role text NOT NULL CHECK (role IN ('OWNER', 'VENUE_MANAGER', 'RECEPTION', 'BAR_STAFF'))`
  - `token_hash bytea NOT NULL UNIQUE`
  - `invited_by_user_id uuid NOT NULL REFERENCES users(id)`
  - `status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'))`
  - `expires_at timestamptz NOT NULL`
  - `accepted_at timestamptz`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- Permissions granted to `gamerbooker_app`: `SELECT, INSERT, UPDATE, DELETE`.

## 4. API Specification
- `GET /v1/dashboard/venues/:venue_id/wizard-progress`
  - Returns completion status for all onboarding steps and current publication state.
- `GET /v1/dashboard/venues/:venue_id/publish-gates`
  - Evaluates all publish readiness gates and lists missing requirements.
- `POST /v1/dashboard/venues/:venue_id/publish`
  - Verifies gates, transitions venue to `PUBLISHED`, logs audit event, and emits outbox event.
- `POST /v1/dashboard/venues/:venue_id/unpublish`
  - Transitions venue back to `DRAFT`.
- `POST /v1/dashboard/venues/:venue_id/staff/invitations`
  - Creates staff invitation with 72h TTL and returns secure invitation token.
- `GET /v1/dashboard/venues/:venue_id/staff/invitations`
  - Lists pending and historical invitations.
- `POST /v1/dashboard/venues/:venue_id/staff/invitations/:id/revoke`
  - Revokes a pending invitation.
- `POST /v1/auth/invitations/accept`
  - Validates token, marks invitation accepted, creates/activates venue membership.
- `DELETE /v1/dashboard/venues/:venue_id/memberships/:membership_id`
  - Deactivates staff membership with last-owner protection.

## 5. Acceptance Verification Plan
Suite `tests/eng201-venue-setup-and-staff.spec.ts`:
1. Wizard progress tracks incomplete steps on fresh venue.
2. Publish is rejected with 400 `PUBLISH_GATE_FAILED` when resources, schedules, or policies are missing.
3. Fulfilling all gates allows successful publication, emits `VenuePublished` outbox event, and records audit log.
4. Unpublishing returns venue to `DRAFT`.
5. Owner can issue staff invitation with secure 72h token.
6. Venue manager cannot invite another manager or owner (`403 ROLE_ELEVATION_NOT_PERMITTED`).
7. User accepts invitation via token; membership is created and active.
8. Replay of accepted token is rejected with 400 `INVITATION_ALREADY_USED`.
9. Expired invitation is rejected with 400 `INVITATION_EXPIRED`.
10. Owner cannot remove the last active owner of the venue (`400 CANNOT_REMOVE_LAST_OWNER`).
