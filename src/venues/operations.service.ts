import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  ActiveBookingSummary,
  ActiveMaintenanceSummary,
  CalendarBookingItem,
  CalendarResult,
  CheckinQueueItem,
  CreateMaintenanceBlockDto,
  LiveFloorResource,
  LiveFloorResult,
  MaintenanceBlockDetail,
} from './operations.types';

function notFound(message = 'Resource not found'): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message);
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

@Injectable()
export class OperationsService {
  async getLiveFloor(venueId: string): Promise<LiveFloorResult> {
    const pool = getPool();

    // 1. Fetch all resources with room and zone details
    const resourcesRes = await pool.query<{
      id: string;
      name: string;
      type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
      status: string;
      bookable: boolean;
      room_id: string | null;
      zone_id: string | null;
      room_name: string | null;
      zone_name: string | null;
      attributes: Record<string, unknown>;
    }>(
      `SELECT r.id, r.name, r.type, r.status, r.bookable,
              r.room_id, r.zone_id,
              rm.name as room_name,
              zn.name as zone_name,
              r.attributes
       FROM resources r
       LEFT JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN zones zn ON zn.id = r.zone_id
       WHERE r.venue_id = $1
       ORDER BY r.name ASC`,
      [venueId],
    );

    // 2. Fetch active maintenance blocks overlapping now()
    const maintenanceRes = await pool.query<{
      id: string;
      resource_id: string;
      reason: string;
      starts_at: Date;
      ends_at: Date;
    }>(
      `SELECT id, resource_id, reason, starts_at, ends_at
       FROM maintenance_blocks
       WHERE venue_id = $1
         AND status = 'ACTIVE'
         AND starts_at <= now()
         AND ends_at > now()`,
      [venueId],
    );
    const maintenanceByResource = new Map<string, ActiveMaintenanceSummary>();
    for (const m of maintenanceRes.rows) {
      maintenanceByResource.set(m.resource_id, {
        maintenance_id: m.id,
        reason: m.reason,
        starts_at: m.starts_at.toISOString(),
        ends_at: m.ends_at.toISOString(),
      });
    }

    // 3. Fetch active claims and bookings overlapping now()
    const claimsRes = await pool.query<{
      resource_id: string;
      booking_id: string;
      public_code: string;
      booking_status: string;
      starts_at: Date;
      ends_at: Date;
      customer_email: string;
      total_minor: string;
      balance_minor: string;
    }>(
      `SELECT rc.resource_id, b.id as booking_id, b.public_code, b.status as booking_status,
              b.starts_at, b.ends_at, u.email as customer_email,
              b.total_minor, b.balance_minor
       FROM resource_claims rc
       JOIN bookings b ON b.id = rc.booking_id
       JOIN users u ON u.id = b.customer_id
       WHERE b.venue_id = $1
         AND rc.state = 'CONFIRMED'
         AND b.status IN ('CONFIRMED', 'CHECKED_IN')
         AND rc.slot @> now()`,
      [venueId],
    );
    const bookingsByResource = new Map<string, ActiveBookingSummary>();
    for (const c of claimsRes.rows) {
      bookingsByResource.set(c.resource_id, {
        booking_id: c.booking_id,
        public_code: c.public_code,
        status: c.booking_status,
        starts_at: c.starts_at.toISOString(),
        ends_at: c.ends_at.toISOString(),
        customer_email_masked: maskEmail(c.customer_email),
        total_minor: parseInt(c.total_minor, 10),
        balance_minor: parseInt(c.balance_minor, 10),
      });
    }

    // 4. Compute status per resource
    const liveResources: LiveFloorResource[] = [];
    const summary = {
      total_resources: resourcesRes.rows.length,
      available: 0,
      booked: 0,
      occupied: 0,
      maintenance: 0,
      temp_blocked: 0,
    };

    for (const r of resourcesRes.rows) {
      const activeMaint = maintenanceByResource.get(r.id) ?? null;
      const activeBooking = bookingsByResource.get(r.id) ?? null;

      let computedStatus: 'AVAILABLE' | 'BOOKED' | 'OCCUPIED' | 'MAINTENANCE' | 'TEMP_BLOCKED';

      if (r.status === 'MAINTENANCE' || activeMaint !== null) {
        computedStatus = 'MAINTENANCE';
        summary.maintenance++;
      } else if (r.status === 'TEMP_BLOCKED') {
        computedStatus = 'TEMP_BLOCKED';
        summary.temp_blocked++;
      } else if (activeBooking !== null) {
        if (activeBooking.status === 'CHECKED_IN') {
          computedStatus = 'OCCUPIED';
          summary.occupied++;
        } else {
          computedStatus = 'BOOKED';
          summary.booked++;
        }
      } else {
        computedStatus = 'AVAILABLE';
        summary.available++;
      }

      liveResources.push({
        resource_id: r.id,
        name: r.name,
        type: r.type,
        room_id: r.room_id,
        zone_id: r.zone_id,
        room_name: r.room_name,
        zone_name: r.zone_name,
        attributes: r.attributes,
        current_status: computedStatus,
        active_booking: activeBooking,
        active_maintenance: activeMaint,
      });
    }

    return {
      venue_id: venueId,
      timestamp: new Date().toISOString(),
      summary,
      resources: liveResources,
    };
  }

  async getCalendar(
    venueId: string,
    from: Date,
    to: Date,
    options?: { roomId?: string; zoneId?: string; status?: string },
  ): Promise<CalendarResult> {
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      throw badRequest('INVALID_DATE_RANGE', "'from' and 'to' must be valid dates and 'from' < 'to'");
    }

    const pool = getPool();

    let sql = `
      SELECT b.id, b.public_code, b.status, b.starts_at, b.ends_at,
             b.paid_minor, b.total_minor, b.balance_minor, b.customer_id,
             u.email as customer_email,
             COALESCE(b.policy_snapshot->>'prepaid_mode', 'FULL') as prepaid_mode,
             array_agg(DISTINCT rc.resource_id) as resource_ids,
             array_agg(DISTINCT r.name) as resource_names
      FROM bookings b
      JOIN users u ON u.id = b.customer_id
      LEFT JOIN resource_claims rc ON rc.booking_id = b.id
      LEFT JOIN resources r ON r.id = rc.resource_id
      WHERE b.venue_id = $1
        AND b.starts_at < $3::timestamptz
        AND b.ends_at > $2::timestamptz
    `;
    const params: unknown[] = [venueId, from.toISOString(), to.toISOString()];

    if (options?.status) {
      params.push(options.status);
      sql += ` AND b.status = $${params.length}`;
    }
    if (options?.roomId) {
      params.push(options.roomId);
      sql += ` AND r.room_id = $${params.length}`;
    }
    if (options?.zoneId) {
      params.push(options.zoneId);
      sql += ` AND r.zone_id = $${params.length}`;
    }

    sql += `
      GROUP BY b.id, b.public_code, b.status, b.starts_at, b.ends_at,
               b.paid_minor, b.total_minor, b.balance_minor, b.customer_id,
               u.email, b.policy_snapshot
      ORDER BY b.starts_at ASC
    `;

    const res = await pool.query<{
      id: string;
      public_code: string;
      status: string;
      starts_at: Date;
      ends_at: Date;
      paid_minor: string;
      total_minor: string;
      balance_minor: string;
      customer_id: string;
      customer_email: string;
      prepaid_mode: string;
      resource_ids: string[];
      resource_names: string[];
    }>(sql, params);

    const summary = {
      total_bookings: res.rows.length,
      confirmed_count: 0,
      checked_in_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      no_show_count: 0,
      total_revenue_minor: 0,
      outstanding_balance_minor: 0,
    };

    const bookings: CalendarBookingItem[] = res.rows.map((row) => {
      const paid = parseInt(row.paid_minor, 10);
      const total = parseInt(row.total_minor, 10);
      const balance = parseInt(row.balance_minor, 10);

      summary.total_revenue_minor += paid;
      summary.outstanding_balance_minor += balance;

      if (row.status === 'CONFIRMED') summary.confirmed_count++;
      else if (row.status === 'CHECKED_IN') summary.checked_in_count++;
      else if (row.status === 'COMPLETED') summary.completed_count++;
      else if (row.status === 'CANCELLED') summary.cancelled_count++;
      else if (row.status === 'NO_SHOW') summary.no_show_count++;

      return {
        booking_id: row.id,
        public_code: row.public_code,
        status: row.status,
        starts_at: row.starts_at.toISOString(),
        ends_at: row.ends_at.toISOString(),
        resource_ids: (row.resource_ids ?? []).filter(Boolean),
        resource_names: (row.resource_names ?? []).filter(Boolean),
        customer: {
          user_id: row.customer_id,
          email_masked: maskEmail(row.customer_email),
        },
        prepaid_mode: row.prepaid_mode,
        paid_minor: paid,
        total_minor: total,
        balance_minor: balance,
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      summary,
      bookings,
    };
  }

  async getCheckinQueue(venueId: string): Promise<{ items: CheckinQueueItem[] }> {
    const pool = getPool();

    // Today's bookings arriving soon (starts_at <= now() + 2h and ends_at >= now())
    const res = await pool.query<{
      id: string;
      public_code: string;
      status: string;
      starts_at: Date;
      ends_at: Date;
      customer_id: string;
      customer_email: string;
      balance_minor: string;
      resources_json: Array<{ id: string; name: string; type: string }>;
    }>(
      `SELECT b.id, b.public_code, b.status, b.starts_at, b.ends_at,
              b.customer_id, u.email as customer_email, b.balance_minor,
              COALESCE(
                json_agg(
                  json_build_object('id', r.id, 'name', r.name, 'type', r.type)
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'
              ) as resources_json
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       LEFT JOIN resource_claims rc ON rc.booking_id = b.id
       LEFT JOIN resources r ON r.id = rc.resource_id
       WHERE b.venue_id = $1
         AND b.status IN ('CONFIRMED', 'CHECKED_IN')
         AND b.starts_at <= now() + interval '2 hours'
         AND b.ends_at >= now()
       GROUP BY b.id, b.public_code, b.status, b.starts_at, b.ends_at, b.customer_id, u.email, b.balance_minor
       ORDER BY b.starts_at ASC`,
      [venueId],
    );

    const nowTime = Date.now();
    const items: CheckinQueueItem[] = res.rows.map((row) => {
      const balance = parseInt(row.balance_minor, 10);
      const startMs = new Date(row.starts_at).getTime();
      const endMs = new Date(row.ends_at).getTime();

      // Eligible 15m before start up to end time
      const isReady = nowTime >= startMs - 15 * 60 * 1000 && nowTime <= endMs;

      return {
        booking_id: row.id,
        public_code: row.public_code,
        status: row.status,
        starts_at: row.starts_at.toISOString(),
        ends_at: row.ends_at.toISOString(),
        customer: {
          user_id: row.customer_id,
          email_masked: maskEmail(row.customer_email),
        },
        resources: row.resources_json ?? [],
        balance_minor: balance,
        is_paid_in_full: balance === 0,
        is_ready_for_checkin: isReady,
      };
    });

    return { items };
  }

  async createMaintenanceBlock(
    venueId: string,
    resourceId: string,
    dto: CreateMaintenanceBlockDto,
    actorId: string,
    actorRole: string,
  ): Promise<MaintenanceBlockDetail> {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(dto.ends_at);

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      throw badRequest('INVALID_INTERVAL', 'starts_at must be strictly before ends_at');
    }

    const pool = getPool();

    // Check resource & tenant
    const resCheck = await pool.query<{ id: string; name: string; tenant_id: string }>(
      `SELECT r.id, r.name, v.tenant_id
       FROM resources r
       JOIN venues v ON v.id = r.venue_id
       WHERE r.id = $1 AND r.venue_id = $2`,
      [resourceId, venueId],
    );
    if (resCheck.rowCount === 0) {
      throw notFound('Resource not found in this venue');
    }
    const { name: resourceName, tenant_id: tenantId } = resCheck.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert GiST exclusion claim
      let claimId: string;
      try {
        const claimRes = await client.query<{ id: string }>(
          `INSERT INTO resource_claims (
            resource_id, tenant_id, holder_id, claim_type, state, slot
          ) VALUES ($1, $2, $3, 'MAINTENANCE', 'CONFIRMED', tstzrange($4::timestamptz, $5::timestamptz, '[)'))
          RETURNING id`,
          [resourceId, tenantId, actorId, startsAt.toISOString(), endsAt.toISOString()],
        );
        claimId = claimRes.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01') {
          // Exclusion collision
          throw conflict(
            'RESOURCE_MAINTENANCE_CONFLICT',
            'Cannot schedule maintenance: resource already has active bookings during this interval.',
          );
        }
        throw err;
      }

      // 2. Insert maintenance block
      const blockRes = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO maintenance_blocks (
          venue_id, tenant_id, resource_id, created_by_user_id, reason, starts_at, ends_at, status, claim_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
        RETURNING id, created_at`,
        [venueId, tenantId, resourceId, actorId, dto.reason.trim(), startsAt, endsAt, claimId],
      );
      const block = blockRes.rows[0];

      // 3. Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'MAINTENANCE_BLOCK_CREATED', 'RESOURCE', $5, $6, $7)`,
        [
          tenantId,
          venueId,
          actorId,
          actorRole,
          resourceId,
          `Maintenance scheduled: ${dto.reason.trim()}`,
          randomUUID(),
        ],
      );

      // 4. Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Resource', $2, 'MaintenanceBlockCreated', $3::jsonb)`,
        [
          tenantId,
          resourceId,
          JSON.stringify({
            maintenance_id: block.id,
            resource_id: resourceId,
            venue_id: venueId,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            reason: dto.reason.trim(),
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        id: block.id,
        venue_id: venueId,
        tenant_id: tenantId,
        resource_id: resourceId,
        resource_name: resourceName,
        created_by_user_id: actorId,
        reason: dto.reason.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'ACTIVE',
        created_at: block.created_at.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listMaintenanceBlocks(
    venueId: string,
    options?: { resourceId?: string; status?: string },
  ): Promise<MaintenanceBlockDetail[]> {
    const pool = getPool();
    let sql = `
      SELECT mb.id, mb.venue_id, mb.tenant_id, mb.resource_id, r.name as resource_name,
             mb.created_by_user_id, mb.reason, mb.starts_at, mb.ends_at, mb.status, mb.created_at
      FROM maintenance_blocks mb
      JOIN resources r ON r.id = mb.resource_id
      WHERE mb.venue_id = $1
    `;
    const params: unknown[] = [venueId];

    if (options?.resourceId) {
      params.push(options.resourceId);
      sql += ` AND mb.resource_id = $${params.length}`;
    }
    if (options?.status) {
      params.push(options.status);
      sql += ` AND mb.status = $${params.length}`;
    }

    sql += ' ORDER BY mb.starts_at DESC';

    const res = await pool.query<{
      id: string;
      venue_id: string;
      tenant_id: string;
      resource_id: string;
      resource_name: string;
      created_by_user_id: string;
      reason: string;
      starts_at: Date;
      ends_at: Date;
      status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      created_at: Date;
    }>(sql, params);

    return res.rows.map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      tenant_id: row.tenant_id,
      resource_id: row.resource_id,
      resource_name: row.resource_name,
      created_by_user_id: row.created_by_user_id,
      reason: row.reason,
      starts_at: row.starts_at.toISOString(),
      ends_at: row.ends_at.toISOString(),
      status: row.status,
      created_at: row.created_at.toISOString(),
    }));
  }

  async cancelMaintenanceBlock(
    venueId: string,
    blockId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ cancelled: boolean }> {
    const pool = getPool();

    const findRes = await pool.query<{
      id: string;
      tenant_id: string;
      resource_id: string;
      status: string;
      claim_id: string | null;
    }>(
      'SELECT id, tenant_id, resource_id, status, claim_id FROM maintenance_blocks WHERE id = $1 AND venue_id = $2',
      [blockId, venueId],
    );
    if (findRes.rowCount === 0) {
      throw notFound('Maintenance block not found');
    }
    const block = findRes.rows[0];

    if (block.status !== 'ACTIVE') {
      throw badRequest('MAINTENANCE_BLOCK_NOT_ACTIVE', `Cannot cancel block in ${block.status} status`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update maintenance block
      await client.query(
        "UPDATE maintenance_blocks SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [blockId],
      );

      // 2. Release exclusion claim
      if (block.claim_id) {
        await client.query(
          "UPDATE resource_claims SET state = 'RELEASED', updated_at = now() WHERE id = $1",
          [block.claim_id],
        );
      }

      // 3. Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'MAINTENANCE_BLOCK_CANCELLED', 'RESOURCE', $5, 'Cancelled by staff', $6)`,
        [block.tenant_id, venueId, actorId, actorRole, block.resource_id, randomUUID()],
      );

      // 4. Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Resource', $2, 'MaintenanceBlockCancelled', $3::jsonb)`,
        [
          block.tenant_id,
          block.resource_id,
          JSON.stringify({
            maintenance_id: blockId,
            resource_id: block.resource_id,
            venue_id: venueId,
          }),
        ],
      );

      await client.query('COMMIT');
      return { cancelled: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
