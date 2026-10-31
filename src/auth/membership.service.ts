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
export const MFA_GATED_ROLES = ['OWNER', 'VENUE_MANAGER', 'PLATFORM_ADMIN'] as const;

export const VENUE_ROLES = [
  'PLATFORM_ADMIN',
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
      'SELECT 1 FROM venue_memberships' +
        ' WHERE user_id = $1 AND active = true AND role = ANY($2::text[]) LIMIT 1',
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
      'SELECT role FROM venue_memberships' +
        ' WHERE user_id = $1 AND venue_id = $2 AND active = true',
      [userId, venueId],
    );
    const row = found.rows[0];
    return row ? row.role : null;
  }

  /** The venue, only if the caller holds an active membership on it. */
  async venueForMember(userId: string, venueId: string): Promise<VenueSummary | null> {
    if (!UUID_RE.test(venueId)) {
      return null;
    }
    const found = await getPool().query<VenueSummary>(
      'SELECT v.id, v.tenant_id, v.timezone' +
        ' FROM venues v' +
        ' JOIN venue_memberships m ON m.venue_id = v.id' +
        '   AND m.user_id = $1 AND m.active = true' +
        ' WHERE v.id = $2',
      [userId, venueId],
    );
    return found.rows[0] ?? null;
  }
}
