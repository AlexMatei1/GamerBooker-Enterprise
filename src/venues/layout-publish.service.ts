import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  ValidateLayoutResult,
  LayoutValidationError,
  LayoutValidationWarning,
  PublishLayoutDto,
  RollbackLayoutDto,
  LayoutRevisionDetail,
  CustomerLayoutPreview,
  CustomerPreviewNode,
} from './layout-publish.types';

function notFound(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, code, message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message, details);
}

function toJsonbString(val: any): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val ?? {});
}

@Injectable()
export class LayoutPublishService {
  // ---------------------------------------------------------------------------
  // Validation Engine
  // ---------------------------------------------------------------------------

  async validateDraft(venueId: string, customDraftData?: any): Promise<ValidateLayoutResult> {
    const pool = getPool();

    // 1. Fetch draft if not provided
    let scene = customDraftData;
    if (!scene) {
      const draftRes = await pool.query<any>(
        'SELECT * FROM layout_drafts WHERE venue_id = $1',
        [venueId],
      );
      if (!draftRes.rowCount || draftRes.rowCount === 0) {
        throw notFound('DRAFT_NOT_FOUND', 'No layout draft exists for this venue.');
      }
      scene = draftRes.rows[0];
    }

    const canvas = typeof scene.canvas === 'string' ? JSON.parse(scene.canvas) : (scene.canvas || {});
    const rooms = typeof scene.rooms === 'string' ? JSON.parse(scene.rooms) : (scene.rooms || []);
    const nodes = typeof scene.nodes === 'string' ? JSON.parse(scene.nodes) : (scene.nodes || []);

    const errors: LayoutValidationError[] = [];
    const warnings: LayoutValidationWarning[] = [];

    // Canvas checks
    if (!canvas.width || canvas.width < 200) {
      errors.push({ code: 'INVALID_CANVAS_WIDTH', message: 'Canvas width must be >= 200' });
    }
    if (!canvas.height || canvas.height < 200) {
      errors.push({ code: 'INVALID_CANVAS_HEIGHT', message: 'Canvas height must be >= 200' });
    }

    // Rooms checks
    for (const room of rooms) {
      if (!room.id || !room.name) {
        errors.push({ code: 'INVALID_ROOM', message: 'Rooms must specify id and name' });
      }
      if (room.shape && (room.shape.x < 0 || room.shape.y < 0)) {
        errors.push({ code: 'INVALID_ROOM_COORDINATES', message: `Room "${room.name}" has negative coordinates` });
      }
    }

    // Nodes checks
    const resourceNodes = nodes.filter((n: any) => n.kind === 'RESOURCE');
    const seenResourceIds = new Set<string>();

    for (const rNode of resourceNodes) {
      if (!rNode.resource_id) {
        errors.push({
          code: 'RESOURCE_NODE_MISSING_ID',
          message: `Resource node "${rNode.id}" is missing resource_id`,
          node_id: rNode.id,
        });
        continue;
      }

      if (seenResourceIds.has(rNode.resource_id)) {
        errors.push({
          code: 'DUPLICATE_RESOURCE_IN_SCENE',
          message: `Resource "${rNode.resource_id}" is placed multiple times in the scene`,
          node_id: rNode.id,
          resource_id: rNode.resource_id,
        });
      }
      seenResourceIds.add(rNode.resource_id);
    }

    const resourceIds = Array.from(seenResourceIds);

    // Verify all resources exist and belong to this venue
    if (resourceIds.length > 0) {
      const dbResCheck = await pool.query<{
        id: string;
        name: string;
        type: string;
        status: string;
        bookable: boolean;
        room_id: string | null;
        zone_id: string | null;
      }>(
        'SELECT id, name, type, status, bookable, room_id, zone_id FROM resources WHERE id = ANY($1) AND venue_id = $2',
        [resourceIds, venueId],
      );

      const foundMap = new Map(dbResCheck.rows.map((r) => [r.id, r]));

      for (const resId of resourceIds) {
        const found = foundMap.get(resId);
        if (!found) {
          errors.push({
            code: 'RESOURCE_NOT_FOUND',
            message: `Resource "${resId}" does not exist in venue`,
            resource_id: resId,
          });
          continue;
        }

        // Verify pricing rule exists for bookable resource
        if (found.bookable && found.status === 'AVAILABLE') {
          const ruleCheck = await pool.query(
            `SELECT id FROM price_rules
             WHERE venue_id = $1 AND (
               (target_type = 'RESOURCE' AND target_id = $2) OR
               (target_type = 'ZONE' AND target_id = $3) OR
               (target_type = 'VENUE_DEFAULT')
             ) LIMIT 1`,
            [venueId, found.id, found.zone_id],
          );
          if (!ruleCheck.rowCount || ruleCheck.rowCount === 0) {
            warnings.push({
              code: 'USING_PLATFORM_FALLBACK_PRICING',
              message: `Resource "${found.name}" has no explicit price rule; using platform default`,
            });
          }
        }
      }
    }

    // Active Booking Deletion Guard:
    // Compare against currently published revision (if any). If a published resource is removed,
    // verify it has no active holds or future confirmed bookings!
    const activeRevRes = await pool.query<{ nodes: any }>(
      `SELECT lr.nodes
       FROM venues v
       JOIN layout_revisions lr ON lr.id = v.active_layout_revision_id
       WHERE v.id = $1`,
      [venueId],
    );

    if (activeRevRes.rowCount && activeRevRes.rowCount > 0) {
      const prevRawNodes = activeRevRes.rows[0].nodes;
      const prevNodes = typeof prevRawNodes === 'string' ? JSON.parse(prevRawNodes) : prevRawNodes;
      const prevResourceIds = (prevNodes || [])
        .filter((n: any) => n.kind === 'RESOURCE' && n.resource_id)
        .map((n: any) => n.resource_id as string);

      const removedResourceIds = prevResourceIds.filter((id: string) => !seenResourceIds.has(id));

      if (removedResourceIds.length > 0) {
        const futureClaims = await pool.query<{ resource_id: string; rname: string; count: string }>(
          `SELECT rc.resource_id, r.name as rname, count(*) as count
           FROM resource_claims rc
           JOIN resources r ON r.id = rc.resource_id
           WHERE rc.resource_id = ANY($1)
             AND rc.state IN ('ACTIVE_HOLD', 'CONFIRMED')
             AND upper(rc.slot) > now()
           GROUP BY rc.resource_id, r.name`,
          [removedResourceIds],
        );

        for (const claimRow of futureClaims.rows) {
          errors.push({
            code: 'DELETED_RESOURCE_HAS_FUTURE_BOOKINGS',
            message: `Resource "${claimRow.rname}" cannot be removed from layout because it has ${claimRow.count} future confirmed bookings or active holds`,
            resource_id: claimRow.resource_id,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      resource_count: resourceIds.length,
      room_count: rooms.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Atomic Publish
  // ---------------------------------------------------------------------------

  async publishDraft(
    venueId: string,
    actorId: string,
    actorRole: string,
    dto: PublishLayoutDto,
    requestId: string,
  ): Promise<LayoutRevisionDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueRes = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM venues WHERE id = $1 FOR UPDATE',
        [venueId],
      );
      if (!venueRes.rowCount || venueRes.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueRes.rows[0].tenant_id;

      // Lock draft
      const draftRes = await client.query<any>(
        'SELECT * FROM layout_drafts WHERE venue_id = $1 FOR UPDATE',
        [venueId],
      );
      if (!draftRes.rowCount || draftRes.rowCount === 0) {
        throw notFound('DRAFT_NOT_FOUND', 'No layout draft exists for this venue.');
      }
      const draft = draftRes.rows[0];

      // Optimistic revision concurrency
      if (Number(draft.revision) !== dto.expected_draft_revision) {
        throw conflict(
          'LAYOUT_REVISION_CONFLICT',
          `Cannot publish layout. Expected draft revision ${dto.expected_draft_revision}, but current revision is ${draft.revision}.`,
          { current_revision: Number(draft.revision), expected_revision: dto.expected_draft_revision },
        );
      }

      // Run full validation suite
      const validation = await this.validateDraft(venueId, draft);
      if (!validation.valid) {
        throw badRequest(
          'LAYOUT_VALIDATION_FAILED',
          'Layout failed pre-publication validation checks',
          { errors: validation.errors },
        );
      }

      // Calculate next revision number
      const maxRevRes = await client.query<{ next_rev: string }>(
        'SELECT COALESCE(MAX(revision_number), 0) + 1 as next_rev FROM layout_revisions WHERE venue_id = $1',
        [venueId],
      );
      const nextRevisionNumber = parseInt(maxRevRes.rows[0].next_rev, 10);

      // Insert immutable layout revision
      const revRes = await client.query<any>(
        `INSERT INTO layout_revisions (
          venue_id, revision_number, schema_version, canvas, rooms, layers, nodes, metadata,
          published_by, change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          venueId,
          nextRevisionNumber,
          Number(draft.schema_version),
          toJsonbString(draft.canvas),
          toJsonbString(draft.rooms),
          toJsonbString(draft.layers),
          toJsonbString(draft.nodes),
          toJsonbString(draft.metadata),
          actorId,
          dto.change_summary || `Published revision ${nextRevisionNumber}`,
        ],
      );
      const revision = revRes.rows[0];

      // Update venue active pointer
      await client.query(
        'UPDATE venues SET active_layout_revision_id = $1 WHERE id = $2',
        [revision.id, venueId],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'LAYOUT_PUBLISHED', 'LAYOUT_REVISION', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          revision.id,
          JSON.stringify({
            revision_number: nextRevisionNumber,
            change_summary: dto.change_summary,
            resource_count: validation.resource_count,
            room_count: validation.room_count,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'LayoutRevision', $2, 'LayoutPublished', $3)`,
        [
          tenantId,
          revision.id,
          JSON.stringify({
            venue_id: venueId,
            revision_number: nextRevisionNumber,
            published_by: actorId,
            published_at: revision.published_at,
          }),
        ],
      );

      await client.query('COMMIT');
      return this.mapRevisionRow(revision, true);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  async rollbackLayout(
    venueId: string,
    actorId: string,
    actorRole: string,
    dto: RollbackLayoutDto,
    requestId: string,
  ): Promise<LayoutRevisionDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const venueRes = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM venues WHERE id = $1 FOR UPDATE',
        [venueId],
      );
      if (!venueRes.rowCount || venueRes.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const tenantId = venueRes.rows[0].tenant_id;

      // Find target revision
      const targetRevRes = await client.query<any>(
        'SELECT * FROM layout_revisions WHERE venue_id = $1 AND revision_number = $2',
        [venueId, dto.target_revision_number],
      );
      if (!targetRevRes.rowCount || targetRevRes.rowCount === 0) {
        throw notFound(
          'REVISION_NOT_FOUND',
          `Layout revision ${dto.target_revision_number} not found for this venue.`,
        );
      }
      const targetRev = targetRevRes.rows[0];

      // Validate target revision data against current active state
      const validation = await this.validateDraft(venueId, targetRev);
      if (!validation.valid) {
        throw badRequest(
          'ROLLBACK_VALIDATION_FAILED',
          `Cannot rollback to revision ${dto.target_revision_number} due to validation conflicts`,
          { errors: validation.errors },
        );
      }

      // Next revision number
      const maxRevRes = await client.query<{ next_rev: string }>(
        'SELECT COALESCE(MAX(revision_number), 0) + 1 as next_rev FROM layout_revisions WHERE venue_id = $1',
        [venueId],
      );
      const nextRevisionNumber = parseInt(maxRevRes.rows[0].next_rev, 10);

      // Create NEW revision based on target revision
      const newRevRes = await client.query<any>(
        `INSERT INTO layout_revisions (
          venue_id, revision_number, schema_version, canvas, rooms, layers, nodes, metadata,
          published_by, change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          venueId,
          nextRevisionNumber,
          Number(targetRev.schema_version),
          toJsonbString(targetRev.canvas),
          toJsonbString(targetRev.rooms),
          toJsonbString(targetRev.layers),
          toJsonbString(targetRev.nodes),
          toJsonbString(targetRev.metadata),
          actorId,
          `Rollback to revision ${dto.target_revision_number}: ${dto.reason || 'Restored historical layout'}`,
        ],
      );
      const newRevision = newRevRes.rows[0];

      // Update venue active pointer
      await client.query(
        'UPDATE venues SET active_layout_revision_id = $1 WHERE id = $2',
        [newRevision.id, venueId],
      );

      // Sync draft with rollback state
      await client.query(
        `UPDATE layout_drafts
         SET canvas = $1, rooms = $2, layers = $3, nodes = $4, metadata = $5,
             revision = revision + 1, updated_at = now(), updated_by = $6
         WHERE venue_id = $7`,
        [
          toJsonbString(targetRev.canvas),
          toJsonbString(targetRev.rooms),
          toJsonbString(targetRev.layers),
          toJsonbString(targetRev.nodes),
          toJsonbString(targetRev.metadata),
          actorId,
          venueId,
        ],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'LAYOUT_ROLLBACK_PUBLISHED', 'LAYOUT_REVISION', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          newRevision.id,
          JSON.stringify({
            new_revision_number: nextRevisionNumber,
            rolled_back_to: dto.target_revision_number,
            reason: dto.reason,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'LayoutRevision', $2, 'LayoutRollbackPublished', $3)`,
        [
          tenantId,
          newRevision.id,
          JSON.stringify({
            venue_id: venueId,
            new_revision_number: nextRevisionNumber,
            target_revision_number: dto.target_revision_number,
          }),
        ],
      );

      await client.query('COMMIT');
      return this.mapRevisionRow(newRevision, true);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Revision List
  // ---------------------------------------------------------------------------

  async listRevisions(venueId: string): Promise<LayoutRevisionDetail[]> {
    const pool = getPool();
    const res = await pool.query<any>(
      `SELECT lr.*, (v.active_layout_revision_id = lr.id) as is_active
       FROM layout_revisions lr
       JOIN venues v ON v.id = lr.venue_id
       WHERE lr.venue_id = $1
       ORDER BY lr.revision_number DESC`,
      [venueId],
    );

    return res.rows.map((row) => this.mapRevisionRow(row, Boolean(row.is_active)));
  }

  // ---------------------------------------------------------------------------
  // Customer Preview
  // ---------------------------------------------------------------------------

  async getCustomerPreview(
    venueId: string,
    isDraft: boolean,
    fromStr?: string,
    toStr?: string,
  ): Promise<CustomerLayoutPreview> {
    const pool = getPool();

    let scene: any;
    let revNumber = 0;
    const source: 'DRAFT' | 'PUBLISHED' = isDraft ? 'DRAFT' : 'PUBLISHED';

    if (isDraft) {
      const draftRes = await pool.query<any>(
        'SELECT * FROM layout_drafts WHERE venue_id = $1',
        [venueId],
      );
      if (!draftRes.rowCount || draftRes.rowCount === 0) {
        throw notFound('DRAFT_NOT_FOUND', 'No layout draft exists for this venue.');
      }
      scene = draftRes.rows[0];
      revNumber = Number(scene.revision);
    } else {
      const pubRes = await pool.query<any>(
        `SELECT lr.*
         FROM venues v
         JOIN layout_revisions lr ON lr.id = v.active_layout_revision_id
         WHERE v.id = $1`,
        [venueId],
      );
      if (!pubRes.rowCount || pubRes.rowCount === 0) {
        throw notFound('NO_PUBLISHED_LAYOUT', 'This venue has no active published layout.');
      }
      scene = pubRes.rows[0];
      revNumber = Number(scene.revision_number);
    }

    const canvas = typeof scene.canvas === 'string' ? JSON.parse(scene.canvas) : scene.canvas;
    const rooms = typeof scene.rooms === 'string' ? JSON.parse(scene.rooms) : scene.rooms;
    const layers = typeof scene.layers === 'string' ? JSON.parse(scene.layers) : scene.layers;
    const nodes = typeof scene.nodes === 'string' ? JSON.parse(scene.nodes) : scene.nodes;

    // Time window for occupancy check
    const from = fromStr ? new Date(fromStr) : new Date();
    const to = toStr ? new Date(toStr) : new Date(from.getTime() + 2 * 3600 * 1000);

    // Load active claims covering interval (joining resources to scope by venue)
    const claimsRes = await pool.query<{ resource_id: string; claim_type: string }>(
      `SELECT rc.resource_id, rc.claim_type
       FROM resource_claims rc
       JOIN resources r ON r.id = rc.resource_id
       WHERE r.venue_id = $1
         AND rc.state IN ('ACTIVE_HOLD', 'CONFIRMED')
         AND rc.slot && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [venueId, from.toISOString(), to.toISOString()],
    );

    const claimMap = new Map<string, string>();
    claimsRes.rows.forEach((c) => {
      claimMap.set(c.resource_id, c.claim_type);
    });

    // Load DB resource details
    const resNodes = (nodes || []).filter((n: any) => n.kind === 'RESOURCE' && n.resource_id);
    const resIds = resNodes.map((n: any) => n.resource_id);

    const dbResMap = new Map<string, any>();
    if (resIds.length > 0) {
      const dbRes = await pool.query<any>(
        `SELECT r.id, r.name, r.type, r.status, r.bookable, r.zone_id,
                COALESCE(pr.hourly_rate_minor, pz.hourly_rate_minor, pv.hourly_rate_minor, 2000) as hourly_rate_minor,
                COALESCE(pr.currency, pz.currency, pv.currency, 'RON') as currency
         FROM resources r
         LEFT JOIN price_rules pr ON pr.venue_id = r.venue_id AND pr.target_type = 'RESOURCE' AND pr.target_id = r.id
         LEFT JOIN price_rules pz ON pz.venue_id = r.venue_id AND pz.target_type = 'ZONE' AND pz.target_id = r.zone_id
         LEFT JOIN price_rules pv ON pv.venue_id = r.venue_id AND pv.target_type = 'VENUE_DEFAULT'
         WHERE r.id = ANY($1) AND r.venue_id = $2`,
        [resIds, venueId],
      );
      dbRes.rows.forEach((r) => dbResMap.set(r.id, r));
    }

    let totalResources = 0;
    let availableCount = 0;
    let bookedCount = 0;
    let maintenanceCount = 0;

    const previewNodes: CustomerPreviewNode[] = (nodes || []).map((node: any) => {
      if (node.kind !== 'RESOURCE' || !node.resource_id) {
        return node;
      }

      totalResources++;
      const dbItem = dbResMap.get(node.resource_id);
      const claimType = claimMap.get(node.resource_id);

      let status: 'AVAILABLE' | 'BOOKED' | 'MAINTENANCE' = 'AVAILABLE';
      if (dbItem?.status === 'MAINTENANCE' || claimType === 'MAINTENANCE') {
        status = 'MAINTENANCE';
        maintenanceCount++;
      } else if (claimType) {
        status = 'BOOKED';
        bookedCount++;
      } else if (!dbItem?.bookable) {
        status = 'MAINTENANCE';
        maintenanceCount++;
      } else {
        status = 'AVAILABLE';
        availableCount++;
      }

      return {
        ...node,
        resource: {
          id: node.resource_id,
          name: dbItem?.name || node.label || 'Station',
          type: dbItem?.type || 'PC',
          hourly_rate_minor: Number(dbItem?.hourly_rate_minor || 2000),
          currency: dbItem?.currency || 'RON',
          status,
        },
      };
    });

    return {
      venue_id: venueId,
      source,
      revision_number: revNumber,
      canvas,
      rooms,
      layers,
      nodes: previewNodes,
      interval: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total_resources: totalResources,
        available: availableCount,
        booked: bookedCount,
        maintenance: maintenanceCount,
      },
    };
  }

  private mapRevisionRow(row: any, isActive: boolean): LayoutRevisionDetail {
    return {
      id: row.id,
      venue_id: row.venue_id,
      revision_number: Number(row.revision_number),
      schema_version: Number(row.schema_version),
      canvas: typeof row.canvas === 'string' ? JSON.parse(row.canvas) : row.canvas,
      rooms: typeof row.rooms === 'string' ? JSON.parse(row.rooms) : row.rooms,
      layers: typeof row.layers === 'string' ? JSON.parse(row.layers) : row.layers,
      nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      published_at: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
      published_by: row.published_by || null,
      change_summary: row.change_summary || null,
      is_active: isActive,
    };
  }
}
