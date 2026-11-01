import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  ResourceInspectorDetail,
  UpdateInspectorDto,
  AdjacencyEdgeItem,
  CreateAdjacencyDto,
  SuggestedAdjacency,
  PrivateRoomCompositionDetail,
  UpdateCompositionDto,
} from './inspector.types';

function notFound(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, code, message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message, details);
}

@Injectable()
export class InspectorService {
  // ---------------------------------------------------------------------------
  // Resource Inspector
  // ---------------------------------------------------------------------------

  async getResourceInspector(venueId: string, resourceId: string): Promise<ResourceInspectorDetail> {
    const pool = getPool();

    // 1. Fetch resource metadata with room and zone
    const res = await pool.query<any>(
      `SELECT r.id, r.venue_id, r.name, r.type, r.status, r.bookable, r.attributes,
              r.room_id, rm.name as room_name,
              r.zone_id, zn.name as zone_name, zn.policy_profile_id as zone_policy_profile_id
       FROM resources r
       LEFT JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN zones zn ON zn.id = r.zone_id
       WHERE r.id = $1 AND r.venue_id = $2`,
      [resourceId, venueId],
    );

    if (!res.rowCount || res.rowCount === 0) {
      throw notFound('RESOURCE_NOT_FOUND', `Resource "${resourceId}" not found in venue.`);
    }

    const row = res.rows[0];

    // 2. Resolve Effective Pricing
    const pricingRes = await pool.query<{
      target_type: string;
      target_id: string | null;
      hourly_rate_minor: number;
      currency: string;
    }>(
      `SELECT target_type, target_id, hourly_rate_minor, currency
       FROM price_rules
       WHERE venue_id = $1
       ORDER BY CASE
         WHEN target_type = 'RESOURCE' AND target_id = $2 THEN 1
         WHEN target_type = 'ZONE' AND target_id = $3 THEN 2
         WHEN target_type = 'VENUE_DEFAULT' THEN 3
         ELSE 4
       END ASC
       LIMIT 1`,
      [venueId, resourceId, row.zone_id],
    );

    let pricing = {
      hourly_rate_minor: 2000,
      source: 'PLATFORM_DEFAULT' as const,
      currency: 'RON',
    };

    if (pricingRes.rowCount && pricingRes.rowCount > 0) {
      const p = pricingRes.rows[0];
      pricing = {
        hourly_rate_minor: Number(p.hourly_rate_minor),
        source: p.target_type as any,
        currency: p.currency,
      };
    }

    // 3. Resolve Effective Policy Profile
    let policyProfileId = row.zone_policy_profile_id;
    let policyProfileName: string | null = null;
    let policySettings: any = null;

    if (policyProfileId) {
      const profRes = await pool.query<{ name: string; settings: any }>(
        'SELECT name, settings FROM policy_profiles WHERE id = $1',
        [policyProfileId],
      );
      if (profRes.rowCount && profRes.rowCount > 0) {
        policyProfileName = profRes.rows[0].name;
        policySettings = profRes.rows[0].settings;
      }
    }

    if (!policySettings) {
      // Fetch default policy profile for venue
      const defProf = await pool.query<{ id: string; name: string; settings: any }>(
        'SELECT id, name, settings FROM policy_profiles WHERE venue_id = $1 AND is_default = true LIMIT 1',
        [venueId],
      );
      if (defProf.rowCount && defProf.rowCount > 0) {
        policyProfileId = defProf.rows[0].id;
        policyProfileName = defProf.rows[0].name;
        policySettings = defProf.rows[0].settings;
      }
    }

    const parsedPolicy = typeof policySettings === 'string' ? JSON.parse(policySettings) : policySettings;
    const policy = {
      profile_id: policyProfileId || null,
      profile_name: policyProfileName || null,
      cancellation_cutoff_hours: parsedPolicy?.cancellation_cutoff_hours ?? 3,
      deposit_percentage: parsedPolicy?.deposit_percentage ?? 100,
      min_duration_minutes: parsedPolicy?.min_duration_minutes ?? 60,
      max_duration_minutes: parsedPolicy?.max_duration_minutes ?? 480,
    };

    // 4. Resolve Composition (children & parents)
    const childRes = await pool.query<any>(
      `SELECT r.id, r.name, r.type, r.status, r.bookable
       FROM resource_components rc
       JOIN resources r ON r.id = rc.child_resource_id
       WHERE rc.parent_resource_id = $1
       ORDER BY r.name ASC`,
      [resourceId],
    );

    const parentRes = await pool.query<any>(
      `SELECT r.id, r.name, r.type
       FROM resource_components rc
       JOIN resources r ON r.id = rc.parent_resource_id
       WHERE rc.child_resource_id = $1
       ORDER BY r.name ASC`,
      [resourceId],
    );

    // 5. Resolve Adjacencies
    const adjRes = await pool.query<any>(
      `SELECT ra.id as edge_id, ra.distance_metric,
              CASE WHEN ra.resource_a_id = $1 THEN r2.id ELSE r1.id END as neighbor_resource_id,
              CASE WHEN ra.resource_a_id = $1 THEN r2.name ELSE r1.name END as neighbor_name,
              CASE WHEN ra.resource_a_id = $1 THEN r2.type ELSE r1.type END as neighbor_type
       FROM resource_adjacencies ra
       JOIN resources r1 ON r1.id = ra.resource_a_id
       JOIN resources r2 ON r2.id = ra.resource_b_id
       WHERE (ra.resource_a_id = $1 OR ra.resource_b_id = $1) AND ra.venue_id = $2
       ORDER BY ra.distance_metric ASC, neighbor_name ASC`,
      [resourceId, venueId],
    );

    return {
      id: row.id,
      venue_id: row.venue_id,
      name: row.name,
      type: row.type,
      status: row.status,
      bookable: row.bookable,
      room: { id: row.room_id, name: row.room_name },
      zone: { id: row.zone_id, name: row.zone_name },
      attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {}),
      pricing,
      policy,
      components: {
        is_composite: row.type === 'PRIVATE_ROOM' || (childRes.rowCount ? childRes.rowCount > 0 : false),
        child_resources: childRes.rows.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          bookable: c.bookable,
        })),
        parent_resources: parentRes.rows.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
        })),
      },
      adjacencies: adjRes.rows.map((a) => ({
        edge_id: a.edge_id,
        neighbor_resource_id: a.neighbor_resource_id,
        neighbor_name: a.neighbor_name,
        neighbor_type: a.neighbor_type,
        distance_metric: Number(a.distance_metric),
      })),
    };
  }

  async updateResourceInspector(
    venueId: string,
    resourceId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateInspectorDto,
    requestId: string,
  ): Promise<ResourceInspectorDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueCheck = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (!venueCheck.rowCount || venueCheck.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueCheck.rows[0].tenant_id;

      const currentRes = await client.query<any>(
        'SELECT * FROM resources WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [resourceId, venueId],
      );
      if (!currentRes.rowCount || currentRes.rowCount === 0) {
        throw notFound('RESOURCE_NOT_FOUND', `Resource "${resourceId}" not found in venue.`);
      }
      const current = currentRes.rows[0];

      // Validate Room if changed
      if (dto.room_id !== undefined && dto.room_id !== null && dto.room_id !== current.room_id) {
        const roomCheck = await client.query(
          'SELECT id FROM rooms WHERE id = $1 AND venue_id = $2',
          [dto.room_id, venueId],
        );
        if (!roomCheck.rowCount || roomCheck.rowCount === 0) {
          throw notFound('ROOM_NOT_FOUND', `Room "${dto.room_id}" not found in venue.`);
        }
      }

      // Validate Zone if changed
      if (dto.zone_id !== undefined && dto.zone_id !== null && dto.zone_id !== current.zone_id) {
        const zoneCheck = await client.query(
          'SELECT id FROM zones WHERE id = $1 AND venue_id = $2',
          [dto.zone_id, venueId],
        );
        if (!zoneCheck.rowCount || zoneCheck.rowCount === 0) {
          throw notFound('ZONE_NOT_FOUND', `Zone "${dto.zone_id}" not found in venue.`);
        }
      }

      // Validate Name collision if changed
      if (dto.name && dto.name !== current.name) {
        const nameCheck = await client.query(
          'SELECT id FROM resources WHERE venue_id = $1 AND name = $2 AND id <> $3',
          [venueId, dto.name, resourceId],
        );
        if (nameCheck.rowCount && nameCheck.rowCount > 0) {
          throw conflict('RESOURCE_NAME_EXISTS', `Resource name "${dto.name}" already in use in this venue.`);
        }
      }

      const updatedName = dto.name ?? current.name;
      const updatedRoomId = dto.room_id !== undefined ? dto.room_id : current.room_id;
      const updatedZoneId = dto.zone_id !== undefined ? dto.zone_id : current.zone_id;
      const updatedStatus = dto.status ?? current.status;
      const updatedBookable = dto.bookable !== undefined ? dto.bookable : current.bookable;
      const updatedAttributes = dto.attributes ? JSON.stringify(dto.attributes) : current.attributes;

      await client.query(
        `UPDATE resources
         SET name = $1, room_id = $2, zone_id = $3, status = $4, bookable = $5, attributes = $6, updated_at = now()
         WHERE id = $7 AND venue_id = $8`,
        [
          updatedName,
          updatedRoomId,
          updatedZoneId,
          updatedStatus,
          updatedBookable,
          updatedAttributes,
          resourceId,
          venueId,
        ],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'RESOURCE_INSPECTOR_UPDATED', 'RESOURCE', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          resourceId,
          JSON.stringify({
            name: updatedName,
            status: updatedStatus,
            bookable: updatedBookable,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'Resource', $2, 'ResourceUpdated', $3)`,
        [
          tenantId,
          resourceId,
          JSON.stringify({
            resource_id: resourceId,
            venue_id: venueId,
            name: updatedName,
            status: updatedStatus,
            bookable: updatedBookable,
          }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getResourceInspector(venueId, resourceId);
  }

  // ---------------------------------------------------------------------------
  // Adjacency Edges (Smart Seat Graph)
  // ---------------------------------------------------------------------------

  async listAdjacencies(venueId: string): Promise<AdjacencyEdgeItem[]> {
    const pool = getPool();
    const res = await pool.query<any>(
      `SELECT ra.id, ra.venue_id, ra.resource_a_id, r1.name as resource_a_name,
              ra.resource_b_id, r2.name as resource_b_name, ra.distance_metric, ra.created_at
       FROM resource_adjacencies ra
       JOIN resources r1 ON r1.id = ra.resource_a_id
       JOIN resources r2 ON r2.id = ra.resource_b_id
       WHERE ra.venue_id = $1
       ORDER BY r1.name ASC, r2.name ASC`,
      [venueId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      resource_a_id: row.resource_a_id,
      resource_a_name: row.resource_a_name,
      resource_b_id: row.resource_b_id,
      resource_b_name: row.resource_b_name,
      distance_metric: Number(row.distance_metric),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  }

  async createAdjacency(
    venueId: string,
    actorId: string,
    actorRole: string,
    dto: CreateAdjacencyDto,
    requestId: string,
  ): Promise<AdjacencyEdgeItem> {
    if (!dto.resource_a_id || !dto.resource_b_id) {
      throw badRequest('MISSING_ADJACENCY_RESOURCES', 'Must provide both resource_a_id and resource_b_id');
    }
    if (dto.resource_a_id === dto.resource_b_id) {
      throw badRequest('SELF_ADJACENCY_PROHIBITED', 'A resource cannot be adjacent to itself');
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueCheck = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (!venueCheck.rowCount || venueCheck.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueCheck.rows[0].tenant_id;

      // Verify both resources belong to venue
      const resCheck = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM resources WHERE id IN ($1, $2) AND venue_id = $3',
        [dto.resource_a_id, dto.resource_b_id, venueId],
      );
      if (!resCheck.rowCount || resCheck.rowCount < 2) {
        throw notFound('RESOURCE_NOT_FOUND', 'One or both resources do not exist in this venue');
      }

      // Order pair lexicographically to satisfy CHECK (resource_a_id < resource_b_id)
      const [minId, maxId] =
        dto.resource_a_id < dto.resource_b_id
          ? [dto.resource_a_id, dto.resource_b_id]
          : [dto.resource_b_id, dto.resource_a_id];

      const distance = Math.max(1, dto.distance_metric || 1);

      const insRes = await client.query<any>(
        `INSERT INTO resource_adjacencies (
          venue_id, resource_a_id, resource_b_id, distance_metric
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (venue_id, resource_a_id, resource_b_id)
        DO UPDATE SET distance_metric = EXCLUDED.distance_metric
        RETURNING id, venue_id, resource_a_id, resource_b_id, distance_metric, created_at`,
        [venueId, minId, maxId, distance],
      );

      const row = insRes.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'ADJACENCY_CREATED', 'RESOURCE_ADJACENCY', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          row.id,
          JSON.stringify({ resource_a_id: minId, resource_b_id: maxId, distance_metric: distance }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'ResourceAdjacency', $2, 'AdjacencyCreated', $3)`,
        [
          tenantId,
          venueId,
          JSON.stringify({ edge_id: row.id, resource_a_id: minId, resource_b_id: maxId }),
        ],
      );

      await client.query('COMMIT');

      const nameMap = new Map(resCheck.rows.map((r) => [r.id, r.name]));

      return {
        id: row.id,
        venue_id: row.venue_id,
        resource_a_id: row.resource_a_id,
        resource_a_name: nameMap.get(row.resource_a_id) || '',
        resource_b_id: row.resource_b_id,
        resource_b_name: nameMap.get(row.resource_b_id) || '',
        distance_metric: Number(row.distance_metric),
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteAdjacency(
    venueId: string,
    edgeId: string,
    actorId: string,
    actorRole: string,
    requestId: string,
  ): Promise<{ deleted: boolean }> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueCheck = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (!venueCheck.rowCount || venueCheck.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueCheck.rows[0].tenant_id;

      const delRes = await client.query(
        'DELETE FROM resource_adjacencies WHERE id = $1 AND venue_id = $2 RETURNING id',
        [edgeId, venueId],
      );
      if (!delRes.rowCount || delRes.rowCount === 0) {
        throw notFound('ADJACENCY_NOT_FOUND', `Adjacency edge "${edgeId}" not found in venue.`);
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'ADJACENCY_DELETED', 'RESOURCE_ADJACENCY', $6, $7)`,
        [tenantId, venueId, requestId || randomUUID(), actorId, actorRole, edgeId, '{}'],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'ResourceAdjacency', $2, 'AdjacencyDeleted', $3)`,
        [tenantId, venueId, JSON.stringify({ edge_id: edgeId })],
      );

      await client.query('COMMIT');
      return { deleted: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async suggestAdjacencies(venueId: string, maxProximity = 180): Promise<SuggestedAdjacency[]> {
    const pool = getPool();

    // 1. Fetch layout draft
    const draftRes = await pool.query<{ nodes: any }>(
      'SELECT nodes FROM layout_drafts WHERE venue_id = $1',
      [venueId],
    );

    if (!draftRes.rowCount || draftRes.rowCount === 0) {
      return [];
    }

    const rawNodes = draftRes.rows[0].nodes;
    const nodes = typeof rawNodes === 'string' ? JSON.parse(rawNodes) : rawNodes;

    // Filter resource nodes with valid resource_id
    const resourceNodes = (nodes || []).filter(
      (n: any) => n.kind === 'RESOURCE' && n.resource_id,
    );

    // 2. Load existing adjacencies
    const existingAdj = await pool.query<{ resource_a_id: string; resource_b_id: string }>(
      'SELECT resource_a_id, resource_b_id FROM resource_adjacencies WHERE venue_id = $1',
      [venueId],
    );
    const existingSet = new Set(
      existingAdj.rows.map((r) => `${r.resource_a_id}:${r.resource_b_id}`),
    );

    // 3. Compare pairs within the same room
    const suggestions: SuggestedAdjacency[] = [];

    for (let i = 0; i < resourceNodes.length; i++) {
      for (let j = i + 1; j < resourceNodes.length; j++) {
        const n1 = resourceNodes[i];
        const n2 = resourceNodes[j];

        // Same room requirement
        if (!n1.room_id || !n2.room_id || n1.room_id !== n2.room_id) {
          continue;
        }

        const dx = (n1.x + (n1.w || 60) / 2) - (n2.x + (n2.w || 60) / 2);
        const dy = (n1.y + (n1.h || 40) / 2) - (n2.y + (n2.h || 40) / 2);
        const dist = Math.round(Math.sqrt(dx * dx + dy * dy));

        if (dist <= maxProximity) {
          const [minId, maxId] =
            n1.resource_id < n2.resource_id
              ? [n1.resource_id, n2.resource_id]
              : [n2.resource_id, n1.resource_id];

          const [minName, maxName] =
            n1.resource_id < n2.resource_id ? [n1.label, n2.label] : [n2.label, n1.label];

          const alreadyAdj = existingSet.has(`${minId}:${maxId}`);
          const metric = dist <= 90 ? 1 : dist <= 140 ? 2 : 3;

          suggestions.push({
            resource_a_id: minId,
            resource_a_name: minName || 'Station A',
            resource_b_id: maxId,
            resource_b_name: maxName || 'Station B',
            euclidean_distance: dist,
            suggested_distance_metric: metric,
            room_id: n1.room_id,
            already_adjacent: alreadyAdj,
          });
        }
      }
    }

    // Sort by proximity
    suggestions.sort((a, b) => a.euclidean_distance - b.euclidean_distance);
    return suggestions;
  }

  // ---------------------------------------------------------------------------
  // Private Room Composition Editing
  // ---------------------------------------------------------------------------

  async getPrivateRoomComposition(venueId: string, parentResourceId: string): Promise<PrivateRoomCompositionDetail> {
    const pool = getPool();

    const parentRes = await pool.query<{ id: string; name: string; type: string }>(
      'SELECT id, name, type FROM resources WHERE id = $1 AND venue_id = $2',
      [parentResourceId, venueId],
    );

    if (!parentRes.rowCount || parentRes.rowCount === 0) {
      throw notFound('RESOURCE_NOT_FOUND', `Resource "${parentResourceId}" not found in venue.`);
    }

    const parent = parentRes.rows[0];
    if (parent.type !== 'PRIVATE_ROOM') {
      throw badRequest('INVALID_RESOURCE_TYPE', `Resource "${parent.name}" is not a PRIVATE_ROOM.`);
    }

    const compRes = await pool.query<any>(
      `SELECT r.id, r.name, r.type, r.status, r.bookable
       FROM resource_components rc
       JOIN resources r ON r.id = rc.child_resource_id
       WHERE rc.parent_resource_id = $1
       ORDER BY r.name ASC`,
      [parentResourceId],
    );

    return {
      room_resource_id: parent.id,
      room_name: parent.name,
      total_components: compRes.rowCount || 0,
      components: compRes.rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        bookable: c.bookable,
      })),
    };
  }

  async updatePrivateRoomComposition(
    venueId: string,
    parentResourceId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateCompositionDto,
    requestId: string,
  ): Promise<PrivateRoomCompositionDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueCheck = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (!venueCheck.rowCount || venueCheck.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueCheck.rows[0].tenant_id;

      const parentRes = await client.query<{ id: string; name: string; type: string }>(
        'SELECT id, name, type FROM resources WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [parentResourceId, venueId],
      );

      if (!parentRes.rowCount || parentRes.rowCount === 0) {
        throw notFound('RESOURCE_NOT_FOUND', `Resource "${parentResourceId}" not found in venue.`);
      }

      const parent = parentRes.rows[0];
      if (parent.type !== 'PRIVATE_ROOM') {
        throw badRequest('INVALID_RESOURCE_TYPE', `Resource "${parent.name}" is not of type PRIVATE_ROOM.`);
      }

      const childIds = dto.child_resource_ids || [];

      // Check self-containment
      if (childIds.includes(parentResourceId)) {
        throw badRequest('SELF_CONTAINMENT_PROHIBITED', 'A private room cannot contain itself as a component.');
      }

      // If childIds passed, verify all belong to this venue
      if (childIds.length > 0) {
        const childrenCheck = await client.query<{ id: string }>(
          'SELECT id FROM resources WHERE id = ANY($1) AND venue_id = $2',
          [childIds, venueId],
        );
        if ((childrenCheck.rowCount || 0) < childIds.length) {
          throw notFound('COMPONENT_RESOURCE_NOT_FOUND', 'One or more child resources do not exist in this venue.');
        }

        // Cycle prevention: ensure none of the child IDs are private rooms containing parentResourceId
        const cycleCheck = await client.query(
          'SELECT parent_resource_id FROM resource_components WHERE parent_resource_id = ANY($1) AND child_resource_id = $2',
          [childIds, parentResourceId],
        );
        if (cycleCheck.rowCount && cycleCheck.rowCount > 0) {
          throw badRequest('DAG_CYCLE_DETECTED', 'Circular composition detected between private rooms.');
        }
      }

      // Replace components atomically
      await client.query('DELETE FROM resource_components WHERE parent_resource_id = $1', [parentResourceId]);

      for (const childId of childIds) {
        await client.query(
          `INSERT INTO resource_components (parent_resource_id, child_resource_id, venue_id)
           VALUES ($1, $2, $3)`,
          [parentResourceId, childId, venueId],
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'PRIVATE_ROOM_COMPOSITION_UPDATED', 'RESOURCE', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          parentResourceId,
          JSON.stringify({
            parent_resource_id: parentResourceId,
            child_count: childIds.length,
            child_resource_ids: childIds,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'Resource', $2, 'PrivateRoomCompositionUpdated', $3)`,
        [
          tenantId,
          parentResourceId,
          JSON.stringify({
            parent_resource_id: parentResourceId,
            venue_id: venueId,
            child_count: childIds.length,
          }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getPrivateRoomComposition(venueId, parentResourceId);
  }
}
