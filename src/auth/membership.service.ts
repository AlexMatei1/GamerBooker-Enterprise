import { Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';

/**
 * Role resolution, read from the database on every request.
 *
 * Nothing here takes a role, tenant or venue from the caller: the only inputs
 * are the authenticated user id and the venue id in the path. A claim in a body
 * or a header is ignored by construction (handoff domain invariant 1 and 2).
 */

/** D2: these roles must complete MFA before they can use the product. */
export const MFA_GATED_ROLES = ['OWNER', 'VENUE_MANAGER'] as const;

export const VENUE_ROLES = [
  'OWNER',
  'VENUE_MANAGER',
  'RECEPTION',
  'BAR_STAFF',
] as const;

export type VenueRole = (typeof VENUE_ROLES)[number];

export interface VenueSummary {
  id: string;
  tenant_id: string;
  timezone: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MembershipService {
  /** True when the user holds at least one active membership in a gated role. */
  async holdsGatedRole(userId: string): Promise<boolean> {
    const found = await getPool().query(
      'SELECT 1 WHERE EXISTS (SELECT 1 FROM venue_memberships' +
        ' WHERE user_id = $1 AND active = true AND role = ANY($2::text[]))' +
        ' OR EXISTS (SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL)',
      [userId, MFA_GATED_ROLES],
    );
    return found.rows.length > 0;
  }

  /**
   * The caller's role on one venue, or null when there is no active membership.
   * An inactive membership and a membership on another tenant both return null:
   * the caller must not be able to tell those apart from "no such venue".
   */
  async roleFor(userId: string, venueId: string): Promise<VenueRole | null> {
    if (!UUID_RE.test(venueId)) {
      return null;
    }
    const found = await getPool().query<{ role: VenueRole }>(
      `SELECT m.role FROM venue_memberships m
       JOIN venues v ON v.id=m.venue_id AND v.tenant_id=m.tenant_id
       JOIN users u ON u.id=m.user_id
       JOIN tenants t ON t.id=v.tenant_id
       WHERE m.user_id=$1 AND m.venue_id=$2 AND m.active=true
       AND m.role IN ('OWNER','VENUE_MANAGER','RECEPTION','BAR_STAFF')
       AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL AND u.identity_status='verified'
       AND t.state='active'
       AND NOT EXISTS (SELECT 1 FROM platform_grants g WHERE g.user_id=m.user_id AND g.revoked_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM cafe_applications a WHERE a.applicant_user_id=m.user_id
          AND a.venue_id=m.venue_id AND a.access_suspended=true)`,
      [userId, venueId],
    );
    const row = found.rows[0];
    return row ? row.role : null;
  }

  /** The venue, only if the caller holds an active membership on it. */
  async venueForMember(userId: string, venueId: string): Promise<VenueSummary | null> {
    if (!(await this.roleFor(userId, venueId))) return null;
    if (!UUID_RE.test(venueId)) {
      return null;
    }
    const found = await getPool().query<VenueSummary>(
      'SELECT v.id, v.tenant_id, v.timezone' +
        ' FROM venues v' +
        ' JOIN venue_memberships m ON m.venue_id = v.id AND m.tenant_id=v.tenant_id' +
        '   AND m.user_id = $1 AND m.active = true' +
        ' WHERE v.id = $2',
      [userId, venueId],
    );
    return found.rows[0] ?? null;
  }
}
