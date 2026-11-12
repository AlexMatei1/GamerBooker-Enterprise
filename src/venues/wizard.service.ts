import { createHash, randomBytes, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { VENUE_ROLES, type VenueRole } from '../auth/membership.service';
import type {
  PublishGatesResult,
  StaffInvitationCreatedResult,
  StaffInvitationRow,
  StaffInvitationSummary,
  WizardProgress,
} from './wizard.types';
import type { VenueDetail } from './venues.service';

function notFound(message = 'Resource not found'): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function forbidden(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.FORBIDDEN, code, message);
}

@Injectable()
export class WizardService {
  async getWizardProgress(venueId: string): Promise<WizardProgress> {
    const pool = getPool();

    // 1. Venue details
    const venueRes = await pool.query<{
      id: string;
      name: string;
      timezone: string;
      address: Record<string, unknown>;
      contact: Record<string, unknown>;
      publication_state: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
    }>(
      'SELECT id, name, timezone, address, contact, publication_state FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rowCount === 0) {
      throw notFound('Venue not found');
    }
    const venue = venueRes.rows[0];
    const hasAddress = Boolean(venue.address && Object.keys(venue.address).length > 0);
    const hasContact = Boolean(venue.contact && Object.keys(venue.contact).length > 0);
    const detailsCompleted = Boolean(venue.name && venue.timezone);

    // 2. Rooms and zones
    const roomsCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM rooms WHERE venue_id = $1',
      [venueId],
    );
    const zonesCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM zones WHERE venue_id = $1',
      [venueId],
    );
    const roomCount = parseInt(roomsCountRes.rows[0]?.count ?? '0', 10);
    const zoneCount = parseInt(zonesCountRes.rows[0]?.count ?? '0', 10);
    const roomsZonesCompleted = roomCount >= 1 && zoneCount >= 1;

    // 3. Resources
    const resCountRes = await pool.query<{ total: string; bookable: string }>(
      `SELECT count(*) as total,
              count(*) FILTER (WHERE bookable = true AND status = 'AVAILABLE') as bookable
       FROM resources WHERE venue_id = $1`,
      [venueId],
    );
    const resourceCount = parseInt(resCountRes.rows[0]?.total ?? '0', 10);
    const bookableCount = parseInt(resCountRes.rows[0]?.bookable ?? '0', 10);
    const resourcesCompleted = bookableCount >= 1;

    // 4. Schedules
    const schedCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM operating_schedules WHERE venue_id = $1 AND is_closed = false',
      [venueId],
    );
    const scheduleCount = parseInt(schedCountRes.rows[0]?.count ?? '0', 10);
    const schedulesCompleted = scheduleCount >= 1;

    // 5. Policies and Pricing
    const policyCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM policy_profiles WHERE venue_id = $1 AND is_default = true',
      [venueId],
    );
    const priceCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM price_rules WHERE venue_id = $1',
      [venueId],
    );
    const hasDefaultPolicy = parseInt(policyCountRes.rows[0]?.count ?? '0', 10) >= 1;
    const hasPriceRule = parseInt(priceCountRes.rows[0]?.count ?? '0', 10) >= 1;
    const pricingPoliciesCompleted = hasDefaultPolicy && hasPriceRule;

    // 6. Staff
    const staffCountRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM venue_memberships WHERE venue_id = $1 AND active = true',
      [venueId],
    );
    const staffCount = parseInt(staffCountRes.rows[0]?.count ?? '0', 10);
    const staffCompleted = staffCount >= 1;

    const isComplete =
      detailsCompleted &&
      roomsZonesCompleted &&
      resourcesCompleted &&
      schedulesCompleted &&
      pricingPoliciesCompleted &&
      staffCompleted;

    return {
      venue_id: venueId,
      step_details: {
        completed: detailsCompleted,
        name: venue.name,
        timezone: venue.timezone,
        has_address: hasAddress,
        has_contact: hasContact,
      },
      step_rooms_zones: {
        completed: roomsZonesCompleted,
        room_count: roomCount,
        zone_count: zoneCount,
      },
      step_resources: {
        completed: resourcesCompleted,
        resource_count: resourceCount,
        bookable_count: bookableCount,
      },
      step_schedules: {
        completed: schedulesCompleted,
        schedule_count: scheduleCount,
      },
      step_pricing_policies: {
        completed: pricingPoliciesCompleted,
        has_default_policy: hasDefaultPolicy,
        has_price_rule: hasPriceRule,
      },
      step_staff: {
        completed: staffCompleted,
        staff_count: staffCount,
      },
      publication_state: venue.publication_state,
      is_complete: isComplete,
    };
  }

  async getPublishGates(venueId: string): Promise<PublishGatesResult> {
    const progress = await this.getWizardProgress(venueId);
    const missing: string[] = [];

    const hasBookableResource = progress.step_resources.bookable_count >= 1;
    if (!hasBookableResource) {
      missing.push('At least one bookable resource with AVAILABLE status is required');
    }

    const hasOperatingSchedule = progress.step_schedules.schedule_count >= 1;
    if (!hasOperatingSchedule) {
      missing.push('At least one active operating schedule is required');
    }

    const hasPolicyProfile = progress.step_pricing_policies.has_default_policy;
    if (!hasPolicyProfile) {
      missing.push('A default booking policy profile is required');
    }

    const hasPriceRule = progress.step_pricing_policies.has_price_rule;
    if (!hasPriceRule) {
      missing.push('At least one price rule is required');
    }

    const hasStaff = progress.step_staff.staff_count >= 1;
    if (!hasStaff) {
      missing.push('At least one active staff member is required');
    }

    return {
      can_publish: missing.length === 0,
      current_state: progress.publication_state,
      gates: {
        has_bookable_resource: hasBookableResource,
        has_operating_schedule: hasOperatingSchedule,
        has_policy_profile: hasPolicyProfile,
        has_price_rule: hasPriceRule,
        has_staff: hasStaff,
      },
      missing_requirements: missing,
    };
  }

  async publishVenue(
    venueId: string,
    actorId: string,
    actorRole: string,
  ): Promise<VenueDetail> {
    const gates = await this.getPublishGates(venueId);
    if (!gates.can_publish) {
      throw badRequest(
        'PUBLISH_GATE_FAILED',
        'Venue does not meet publication criteria',
        { missing_requirements: gates.missing_requirements },
      );
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query<VenueDetail>(
        `UPDATE venues
         SET publication_state = 'PUBLISHED', updated_at = now()
         WHERE id = $1
         RETURNING id, tenant_id, name, slug, timezone, address, publication_state, contact, created_at, updated_at`,
        [venueId],
      );
      if (updateRes.rowCount === 0) {
        throw notFound('Venue not found');
      }
      const updated = updateRes.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'VENUE_PUBLISHED', 'VENUE', $5, 'Publish gates verified', $6)`,
        [updated.tenant_id, venueId, actorId, actorRole, venueId, randomUUID()],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Venue', $2, 'VenuePublished', $3::jsonb)`,
        [updated.tenant_id, venueId, JSON.stringify({ venue_id: venueId, publication_state: 'PUBLISHED' })],
      );

      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async unpublishVenue(
    venueId: string,
    actorId: string,
    actorRole: string,
  ): Promise<VenueDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query<VenueDetail>(
        `UPDATE venues
         SET publication_state = 'DRAFT', updated_at = now()
         WHERE id = $1
         RETURNING id, tenant_id, name, slug, timezone, address, publication_state, contact, created_at, updated_at`,
        [venueId],
      );
      if (updateRes.rowCount === 0) {
        throw notFound('Venue not found');
      }
      const updated = updateRes.rows[0];

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'VENUE_UNPUBLISHED', 'VENUE', $5, 'Venue returned to draft', $6)`,
        [updated.tenant_id, venueId, actorId, actorRole, venueId, randomUUID()],
      );

      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Venue', $2, 'VenueUnpublished', $3::jsonb)`,
        [updated.tenant_id, venueId, JSON.stringify({ venue_id: venueId, publication_state: 'DRAFT' })],
      );

      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async createStaffInvitation(
    venueId: string,
    inviterUserId: string,
    inviterRole: string,
    email: string,
    role: VenueRole,
  ): Promise<StaffInvitationCreatedResult> {
    if (!VENUE_ROLES.includes(role)) throw badRequest('VALIDATION_FAILED','Invalid venue role');
    const cleanEmail = (email ?? '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw badRequest('VALIDATION_FAILED', 'A valid email address is required');
    }

    // Role elevation guard:
    // OWNER can invite any role.
    // VENUE_MANAGER can invite only RECEPTION or BAR_STAFF.
    if (inviterRole === 'VENUE_MANAGER' && (role === 'OWNER' || role === 'VENUE_MANAGER')) {
      throw forbidden(
        'ROLE_ELEVATION_NOT_PERMITTED',
        'Venue managers cannot invite other managers or owners',
      );
    }
    if (inviterRole !== 'OWNER' && inviterRole !== 'VENUE_MANAGER') {
      throw forbidden(
        'AUTH_ROLE_NOT_PERMITTED',
        'Insufficient permissions to invite staff members',
      );
    }

    const pool = getPool();

    // Venue check & get tenant_id
    const venueRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rowCount === 0) {
      throw notFound('Venue not found');
    }
    const tenantId = venueRes.rows[0].tenant_id;

    // Check if user is already an active member of this venue
    const memberCheck = await pool.query(
      `SELECT m.id FROM venue_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.venue_id = $1 AND u.email = $2 AND m.active = true`,
      [venueId, cleanEmail],
    );
    if (memberCheck.rowCount && memberCheck.rowCount > 0) {
      throw badRequest('STAFF_ALREADY_MEMBER', 'User is already an active member of this venue');
    }

    // Check if there is already an active pending invitation for this email in this venue
    const pendingCheck = await pool.query(
      `SELECT id FROM staff_invitations
       WHERE venue_id = $1 AND email = $2 AND status = 'PENDING' AND expires_at > now()`,
      [venueId, cleanEmail],
    );
    if (pendingCheck.rowCount && pendingCheck.rowCount > 0) {
      throw badRequest(
        'INVITATION_ALREADY_PENDING',
        'An active invitation is already pending for this email address',
      );
    }

    // Generate secure 32-byte token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours TTL

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertRes = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO staff_invitations (
          venue_id, tenant_id, email, role, token_hash, invited_by_user_id, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
        RETURNING id, expires_at`,
        [venueId, tenantId, cleanEmail, role, tokenHash, inviterUserId, expiresAt],
      );

      const invitation = insertRes.rows[0];

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'STAFF_INVITED', 'STAFF_INVITATION', $5, $6, $7)`,
        [tenantId, venueId, inviterUserId, inviterRole, invitation.id, `Invited ${cleanEmail} as ${role}`, randomUUID()],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'StaffInvitation', $2, 'StaffInvited', $3::jsonb)`,
        [
          tenantId,
          invitation.id,
          JSON.stringify({
            invitation_id: invitation.id,
            venue_id: venueId,
            email: cleanEmail,
            role,
            expires_at: invitation.expires_at.toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        id: invitation.id,
        venue_id: venueId,
        tenant_id: tenantId,
        email: cleanEmail,
        role,
        expires_at: invitation.expires_at.toISOString(),
        token: rawToken,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listStaffInvitations(venueId: string): Promise<StaffInvitationSummary[]> {
    const pool = getPool();
    const res = await pool.query<StaffInvitationRow>(
      `SELECT id, venue_id, tenant_id, email, role, status, expires_at, accepted_at, created_at, updated_at
       FROM staff_invitations
       WHERE venue_id = $1
       ORDER BY created_at DESC`,
      [venueId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      tenant_id: row.tenant_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expires_at: row.expires_at.toISOString(),
      accepted_at: row.accepted_at ? row.accepted_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
    }));
  }

  async revokeStaffInvitation(
    venueId: string,
    invitationId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ revoked: boolean }> {
    const pool = getPool();
    const findRes = await pool.query<StaffInvitationRow>(
      'SELECT id, venue_id, tenant_id, email, role, status FROM staff_invitations WHERE id = $1 AND venue_id = $2',
      [invitationId, venueId],
    );
    if (findRes.rowCount === 0) {
      throw notFound('Staff invitation not found');
    }
    const inv = findRes.rows[0];
    if (inv.status !== 'PENDING') {
      throw badRequest('INVITATION_NOT_PENDING', `Cannot revoke invitation in ${inv.status} status`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        "UPDATE staff_invitations SET status = 'REVOKED', updated_at = now() WHERE id = $1",
        [invitationId],
      );

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'STAFF_INVITATION_REVOKED', 'STAFF_INVITATION', $5, 'Revoked by staff', $6)`,
        [inv.tenant_id, venueId, actorId, actorRole, invitationId, randomUUID()],
      );

      await client.query('COMMIT');
      return { revoked: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async acceptStaffInvitation(
    rawToken: string,
    userId: string,
  ): Promise<{ accepted: boolean; venue_id: string; role: VenueRole }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw badRequest('VALIDATION_FAILED', 'Invitation token is required');
    }

    const tokenHash = createHash('sha256').update(rawToken.trim()).digest();
    const pool = getPool();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const findRes = await client.query<StaffInvitationRow>(
        'SELECT * FROM staff_invitations WHERE token_hash=$1 FOR UPDATE', [tokenHash]);
      const inv = findRes.rows[0];
      if (!inv) throw notFound('Invitation not found or unavailable');
      if (inv.status === 'ACCEPTED') {
        throw badRequest('INVITATION_ALREADY_USED', 'This invitation has already been accepted');
      }
      if (inv.status === 'REVOKED') {
        throw badRequest('INVITATION_REVOKED', 'This invitation has been revoked');
      }
      if (new Date(inv.expires_at).getTime() <= Date.now()) {
        // This row is locked by the current transaction, so the marker must be
        // written through `client`. A second connection would block on our own
        // lock forever. COMMIT it, then throw: the expiry is real state.
        await client.query(
          "UPDATE staff_invitations SET status = 'EXPIRED', updated_at = now() WHERE id = $1 AND status = 'PENDING'",
          [inv.id],
        );
        await client.query('COMMIT');
        throw badRequest('INVITATION_EXPIRED', 'This invitation has expired');
      }
      if (inv.status !== 'PENDING') {
        throw badRequest('INVITATION_NOT_PENDING', `Invitation is in ${inv.status} state`);
      }
      if (!VENUE_ROLES.includes(inv.role)) {
        throw notFound('Invitation not found or unavailable');
      }
      const user = await client.query(
        `SELECT 1 FROM users WHERE id=$1 AND lower(email)=lower($2)
         AND email_verified_at IS NOT NULL AND identity_status='verified' AND deleted_at IS NULL`, [userId,inv.email]);
      if (!user.rowCount) throw notFound('Invitation not found or unavailable');
      const admin = await client.query('SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
      if (admin.rowCount) throw forbidden('AUTH_ROLE_NOT_PERMITTED','Administrator accounts cannot accept venue invitations');
      const venue = await client.query('SELECT 1 FROM venues WHERE id=$1 AND tenant_id=$2',[inv.venue_id,inv.tenant_id]);
      if (!venue.rowCount) throw notFound();

      // Mark invitation accepted
      await client.query(
        "UPDATE staff_invitations SET status = 'ACCEPTED', accepted_at = now(), updated_at = now() WHERE id = $1",
        [inv.id],
      );

      // Upsert membership
      const existingMem = await client.query<{ id: string }>(
        'SELECT id FROM venue_memberships WHERE user_id = $1 AND venue_id = $2',
        [userId, inv.venue_id],
      );
      if (existingMem.rowCount && existingMem.rowCount > 0) {
        await client.query(
          'UPDATE venue_memberships SET role = $1, active = true, updated_at = now() WHERE id = $2',
          [inv.role, existingMem.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active)
           VALUES ($1, $2, $3, $4, true)`,
          [userId, inv.venue_id, inv.tenant_id, inv.role],
        );
      }

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'STAFF_MEMBERSHIP_ACTIVATED', 'VENUE_MEMBERSHIP', $5, 'Accepted staff invitation', $6)`,
        [inv.tenant_id, inv.venue_id, userId, inv.role, inv.venue_id, randomUUID()],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'StaffInvitation', $2, 'StaffInvitationAccepted', $3::jsonb)`,
        [
          inv.tenant_id,
          inv.id,
          JSON.stringify({
            invitation_id: inv.id,
            venue_id: inv.venue_id,
            user_id: userId,
            role: inv.role,
          }),
        ],
      );

      await client.query('COMMIT');
      return { accepted: true, venue_id: inv.venue_id, role: inv.role };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async removeMembership(
    venueId: string,
    membershipId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ removed: boolean }> {
    const pool = getPool();
    const findRes = await pool.query<{ id: string; tenant_id: string; role: VenueRole; active: boolean }>(
      'SELECT id, tenant_id, role, active FROM venue_memberships WHERE id = $1 AND venue_id = $2',
      [membershipId, venueId],
    );
    if (findRes.rowCount === 0) {
      throw notFound('Staff membership not found');
    }
    const mem = findRes.rows[0];

    // If removing an OWNER, ensure it's not the last active OWNER
    if (mem.role === 'OWNER' && mem.active) {
      const ownerCountRes = await pool.query<{ count: string }>(
        `SELECT count(*) FROM venue_memberships
         WHERE venue_id = $1 AND role = 'OWNER' AND active = true AND id != $2`,
        [venueId, membershipId],
      );
      const remainingOwners = parseInt(ownerCountRes.rows[0]?.count ?? '0', 10);
      if (remainingOwners === 0) {
        throw badRequest(
          'CANNOT_REMOVE_LAST_OWNER',
          'Cannot remove or deactivate the only active owner of the venue',
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE venue_memberships SET active = false, updated_at = now() WHERE id = $1 AND venue_id = $2',
        [membershipId, venueId],
      );

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'STAFF_MEMBERSHIP_DEACTIVATED', 'VENUE_MEMBERSHIP', $5, 'Deactivated by owner', $6)`,
        [mem.tenant_id, venueId, actorId, actorRole, membershipId, randomUUID()],
      );

      await client.query('COMMIT');
      return { removed: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
