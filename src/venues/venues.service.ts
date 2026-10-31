import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type { VenueRole } from '../auth/membership.service';

export interface TenantRow {
  id: string;
  legal_name: string;
  billing_profile: Record<string, unknown>;
  state: string;
  created_at: Date;
  updated_at: Date;
}

export interface VenueDetail {
  id: string;
  tenant_id: string;
  name: string;
  slug: string | null;
  timezone: string;
  address: Record<string, unknown>;
  publication_state: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
  contact: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface RoomRow {
  id: string;
  venue_id: string;
  name: string;
  geometry_metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ZoneRow {
  id: string;
  room_id: string;
  venue_id: string;
  name: string;
  policy_profile_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ResourceRow {
  id: string;
  venue_id: string;
  room_id: string | null;
  zone_id: string | null;
  type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  name: string;
  attributes: Record<string, unknown>;
  bookable: boolean;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
  created_at: Date;
  updated_at: Date;
}

export interface ResourceComponentRow {
  parent_resource_id: string;
  child_resource_id: string;
  venue_id: string;
  created_at: Date;
}

export interface MembershipDetail {
  id: string;
  user_id: string;
  venue_id: string;
  tenant_id: string;
  role: VenueRole;
  active: boolean;
  user_email?: string;
  created_at: Date;
  updated_at: Date;
}

function notFound(): AuthHttpError {
  return new AuthHttpError(
    HttpStatus.NOT_FOUND,
    'RESOURCE_NOT_FOUND',
    'The requested resource was not found.',
  );
}

function badRequest(message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message);
}

@Injectable()
export class VenuesService {
  async createTenant(legalName: string, billingProfile: Record<string, unknown> = {}): Promise<TenantRow> {
    const trimmed = (legalName ?? '').trim();
    if (!trimmed) {
      throw badRequest('legal_name is required.');
    }
    const pool = getPool();
    const res = await pool.query<TenantRow>(
      `INSERT INTO tenants (legal_name, billing_profile)
       VALUES ($1, $2::jsonb)
       RETURNING id, legal_name, billing_profile, state, created_at, updated_at`,
      [trimmed, JSON.stringify(billingProfile)],
    );
    return res.rows[0];
  }

  async createVenue(
    tenantId: string,
    data: {
      name: string;
      slug?: string;
      timezone?: string;
      address?: Record<string, unknown>;
      contact?: Record<string, unknown>;
      publication_state?: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
    },
  ): Promise<VenueDetail> {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw badRequest('name is required.');
    }
    const timezone = data.timezone ?? 'Europe/Bucharest';
    const pool = getPool();

    // Verify tenant exists
    const tenantCheck = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenantCheck.rowCount === 0) {
      throw notFound();
    }

    const res = await pool.query<VenueDetail>(
      `INSERT INTO venues (tenant_id, name, slug, timezone, address, contact, publication_state)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, tenant_id, name, slug, timezone, address, contact, publication_state, created_at, updated_at`,
      [
        tenantId,
        name,
        data.slug ?? null,
        timezone,
        JSON.stringify(data.address ?? {}),
        JSON.stringify(data.contact ?? {}),
        data.publication_state ?? 'DRAFT',
      ],
    );
    return res.rows[0];
  }

  async getVenueDetail(venueId: string): Promise<VenueDetail> {
    const pool = getPool();
    const res = await pool.query<VenueDetail>(
      `SELECT id, tenant_id, name, slug, timezone, address, contact, publication_state, created_at, updated_at
       FROM venues WHERE id = $1`,
      [venueId],
    );
    const row = res.rows[0];
    if (!row) {
      throw notFound();
    }
    return row;
  }

  async updateVenue(
    venueId: string,
    updates: {
      name?: string;
      slug?: string;
      timezone?: string;
      address?: Record<string, unknown>;
      contact?: Record<string, unknown>;
      publication_state?: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
    },
  ): Promise<VenueDetail> {
    const current = await this.getVenueDetail(venueId);
    const name = updates.name !== undefined ? updates.name.trim() : current.name;
    if (!name) {
      throw badRequest('name cannot be empty.');
    }
    const slug = updates.slug !== undefined ? updates.slug : current.slug;
    const timezone = updates.timezone !== undefined ? updates.timezone : current.timezone;
    const address = updates.address !== undefined ? updates.address : current.address;
    const contact = updates.contact !== undefined ? updates.contact : current.contact;
    const publicationState = updates.publication_state !== undefined ? updates.publication_state : current.publication_state;

    const pool = getPool();
    const res = await pool.query<VenueDetail>(
      `UPDATE venues
       SET name = $1, slug = $2, timezone = $3, address = $4::jsonb, contact = $5::jsonb,
           publication_state = $6, updated_at = now()
       WHERE id = $7
       RETURNING id, tenant_id, name, slug, timezone, address, contact, publication_state, created_at, updated_at`,
      [name, slug, timezone, JSON.stringify(address), JSON.stringify(contact), publicationState, venueId],
    );
    return res.rows[0];
  }

  async listPublicVenues(): Promise<Array<{ id: string; name: string; slug: string | null; timezone: string }>> {
    const pool = getPool();
    const res = await pool.query<{ id: string; name: string; slug: string | null; timezone: string }>(
      `SELECT id, name, slug, timezone
       FROM venues
       WHERE publication_state = 'PUBLISHED'
       ORDER BY name ASC`,
    );
    return res.rows;
  }

  async listRooms(venueId: string): Promise<RoomRow[]> {
    const pool = getPool();
    const res = await pool.query<RoomRow>(
      `SELECT id, venue_id, name, geometry_metadata, created_at, updated_at
       FROM rooms WHERE venue_id = $1 ORDER BY name ASC`,
      [venueId],
    );
    return res.rows;
  }

  async createRoom(
    venueId: string,
    data: { name: string; geometry_metadata?: Record<string, unknown> },
  ): Promise<RoomRow> {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw badRequest('room name is required.');
    }
    const pool = getPool();
    const res = await pool.query<RoomRow>(
      `INSERT INTO rooms (venue_id, name, geometry_metadata)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, venue_id, name, geometry_metadata, created_at, updated_at`,
      [venueId, name, JSON.stringify(data.geometry_metadata ?? {})],
    );
    return res.rows[0];
  }

  async listZones(venueId: string, roomId?: string): Promise<ZoneRow[]> {
    const pool = getPool();
    let query = 'SELECT id, room_id, venue_id, name, policy_profile_id, created_at, updated_at FROM zones WHERE venue_id = $1';
    const params: unknown[] = [venueId];
    if (roomId) {
      query += ' AND room_id = $2';
      params.push(roomId);
    }
    query += ' ORDER BY name ASC';
    const res = await pool.query<ZoneRow>(query, params);
    return res.rows;
  }

  async createZone(
    venueId: string,
    data: { roomId: string; name: string; policy_profile_id?: string | null },
  ): Promise<ZoneRow> {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw badRequest('zone name is required.');
    }
    if (!data.roomId) {
      throw badRequest('roomId is required.');
    }
    const pool = getPool();

    // Verify room belongs to this venue
    const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1 AND venue_id = $2', [data.roomId, venueId]);
    if (roomCheck.rowCount === 0) {
      throw badRequest('Room does not exist in this venue.');
    }

    const res = await pool.query<ZoneRow>(
      `INSERT INTO zones (room_id, venue_id, name, policy_profile_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, venue_id, name, policy_profile_id, created_at, updated_at`,
      [data.roomId, venueId, name, data.policy_profile_id ?? null],
    );
    return res.rows[0];
  }

  async listResources(venueId: string): Promise<ResourceRow[]> {
    const pool = getPool();
    const res = await pool.query<ResourceRow>(
      `SELECT id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at
       FROM resources WHERE venue_id = $1 ORDER BY name ASC`,
      [venueId],
    );
    return res.rows;
  }

  async createResource(
    venueId: string,
    data: {
      name: string;
      type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
      roomId?: string | null;
      zoneId?: string | null;
      attributes?: Record<string, unknown>;
      bookable?: boolean;
      status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
    },
  ): Promise<ResourceRow> {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw badRequest('resource name is required.');
    }
    if (!['PC', 'CONSOLE_SETUP', 'PRIVATE_ROOM'].includes(data.type)) {
      throw badRequest('type must be PC, CONSOLE_SETUP, or PRIVATE_ROOM.');
    }

    const pool = getPool();
    // Validate roomId and zoneId belong to venue if provided
    if (data.roomId) {
      const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1 AND venue_id = $2', [data.roomId, venueId]);
      if (roomCheck.rowCount === 0) {
        throw badRequest('Room does not belong to this venue.');
      }
    }
    if (data.zoneId) {
      const zoneCheck = await pool.query('SELECT id FROM zones WHERE id = $1 AND venue_id = $2', [data.zoneId, venueId]);
      if (zoneCheck.rowCount === 0) {
        throw badRequest('Zone does not belong to this venue.');
      }
    }

    const res = await pool.query<ResourceRow>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, attributes, bookable, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at`,
      [
        venueId,
        data.roomId ?? null,
        data.zoneId ?? null,
        data.type,
        name,
        JSON.stringify(data.attributes ?? {}),
        data.bookable ?? true,
        data.status ?? 'AVAILABLE',
      ],
    );
    return res.rows[0];
  }

  async addResourceComponent(
    venueId: string,
    parentResourceId: string,
    childResourceId: string,
  ): Promise<ResourceComponentRow> {
    if (parentResourceId === childResourceId) {
      throw badRequest('Resource cannot contain itself.');
    }
    const pool = getPool();

    // Verify both resources belong to this venue
    const check = await pool.query<ResourceRow>(
      'SELECT id, type, venue_id FROM resources WHERE id IN ($1, $2) AND venue_id = $3',
      [parentResourceId, childResourceId, venueId],
    );
    if (check.rowCount !== 2) {
      throw notFound();
    }

    const parent = check.rows.find((r) => r.id === parentResourceId);
    if (parent?.type !== 'PRIVATE_ROOM') {
      throw badRequest('Only PRIVATE_ROOM resources can contain child components.');
    }

    // Direct cycle check
    const cycleCheck = await pool.query(
      'SELECT 1 FROM resource_components WHERE parent_resource_id = $1 AND child_resource_id = $2',
      [childResourceId, parentResourceId],
    );
    if (cycleCheck.rowCount && cycleCheck.rowCount > 0) {
      throw badRequest('Cyclic resource containment is not permitted.');
    }

    const res = await pool.query<ResourceComponentRow>(
      `INSERT INTO resource_components (parent_resource_id, child_resource_id, venue_id)
       VALUES ($1, $2, $3)
       RETURNING parent_resource_id, child_resource_id, venue_id, created_at`,
      [parentResourceId, childResourceId, venueId],
    );
    return res.rows[0];
  }

  async listMemberships(venueId: string): Promise<MembershipDetail[]> {
    const pool = getPool();
    const res = await pool.query<MembershipDetail>(
      `SELECT m.id, m.user_id, m.venue_id, m.tenant_id, m.role, m.active, u.email as user_email,
              m.created_at, m.updated_at
       FROM venue_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.venue_id = $1
       ORDER BY m.created_at ASC`,
      [venueId],
    );
    return res.rows;
  }

  async createMembership(
    venueId: string,
    tenantId: string,
    data: { userId: string; role: VenueRole },
  ): Promise<MembershipDetail> {
    const pool = getPool();
    const userCheck = await pool.query('SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL', [data.userId]);
    if (userCheck.rowCount === 0) {
      throw badRequest('User not found.');
    }

    const res = await pool.query<MembershipDetail>(
      `INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, user_id, venue_id, tenant_id, role, active, created_at, updated_at`,
      [data.userId, venueId, tenantId, data.role],
    );
    const row = res.rows[0];
    row.user_email = userCheck.rows[0].email;
    return row;
  }

  async updateMembership(
    venueId: string,
    membershipId: string,
    updates: { active?: boolean; role?: VenueRole },
  ): Promise<MembershipDetail> {
    const pool = getPool();
    const found = await pool.query<MembershipDetail>(
      'SELECT id, user_id, venue_id, tenant_id, role, active FROM venue_memberships WHERE id = $1 AND venue_id = $2',
      [membershipId, venueId],
    );
    if (found.rowCount === 0) {
      throw notFound();
    }
    const current = found.rows[0];
    const newActive = updates.active !== undefined ? updates.active : current.active;
    const newRole = updates.role !== undefined ? updates.role : current.role;

    const res = await pool.query<MembershipDetail>(
      `UPDATE venue_memberships
       SET active = $1, role = $2, updated_at = now()
       WHERE id = $3 AND venue_id = $4
       RETURNING id, user_id, venue_id, tenant_id, role, active, created_at, updated_at`,
      [newActive, newRole, membershipId, venueId],
    );
    return res.rows[0];
  }
}
