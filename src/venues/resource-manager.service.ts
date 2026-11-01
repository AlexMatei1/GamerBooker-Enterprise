import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type { ResourceRow } from './venues.service';
import type {
  BulkCloneDto,
  BulkImportDto,
  BulkUpdateDto,
  BulkUpdateResult,
  CreateResourceDto,
  UpdateResourceDto,
} from './resource.types';

function notFound(message = 'Resource not found'): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message);
}

@Injectable()
export class ResourceManagerService {
  async getResource(venueId: string, resourceId: string): Promise<ResourceRow> {
    const pool = getPool();
    const res = await pool.query<ResourceRow>(
      `SELECT id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at
       FROM resources WHERE id = $1 AND venue_id = $2`,
      [resourceId, venueId],
    );
    if (res.rowCount === 0) {
      throw notFound('Resource not found in this venue');
    }
    return res.rows[0];
  }

  async updateResource(
    venueId: string,
    resourceId: string,
    updates: UpdateResourceDto,
    actorId: string,
    actorRole: string,
  ): Promise<ResourceRow> {
    const pool = getPool();

    // Check resource existence and get venue tenant_id
    const currentRes = await pool.query<{ id: string; tenant_id: string }>(
      `SELECT r.id, v.tenant_id
       FROM resources r
       JOIN venues v ON v.id = r.venue_id
       WHERE r.id = $1 AND r.venue_id = $2`,
      [resourceId, venueId],
    );
    if (currentRes.rowCount === 0) {
      throw notFound('Resource not found in this venue');
    }
    const tenantId = currentRes.rows[0].tenant_id;

    // Validate roomId and zoneId belong to venue if provided
    if (updates.roomId) {
      const roomCheck = await pool.query(
        'SELECT id FROM rooms WHERE id = $1 AND venue_id = $2',
        [updates.roomId, venueId],
      );
      if (roomCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Room does not belong to this venue');
      }
    }
    if (updates.zoneId) {
      const zoneCheck = await pool.query(
        'SELECT id FROM zones WHERE id = $1 AND venue_id = $2',
        [updates.zoneId, venueId],
      );
      if (zoneCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Zone does not belong to this venue');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query<ResourceRow>(
        `UPDATE resources
         SET name = COALESCE($1, name),
             type = COALESCE($2, type),
             room_id = CASE WHEN $3::boolean THEN $4::uuid ELSE room_id END,
             zone_id = CASE WHEN $5::boolean THEN $6::uuid ELSE zone_id END,
             attributes = CASE WHEN $7::text IS NOT NULL THEN $7::jsonb ELSE attributes END,
             bookable = COALESCE($8, bookable),
             status = COALESCE($9, status),
             updated_at = now()
         WHERE id = $10 AND venue_id = $11
         RETURNING id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at`,
        [
          updates.name ?? null,
          updates.type ?? null,
          updates.roomId !== undefined,
          updates.roomId ?? null,
          updates.zoneId !== undefined,
          updates.zoneId ?? null,
          updates.attributes ? JSON.stringify(updates.attributes) : null,
          updates.bookable !== undefined ? updates.bookable : null,
          updates.status ?? null,
          resourceId,
          venueId,
        ],
      );

      const updated = updateRes.rows[0];

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'RESOURCE_UPDATED', 'RESOURCE', $5, 'Resource attributes or state updated', $6)`,
        [tenantId, venueId, actorId, actorRole, resourceId, randomUUID()],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Resource', $2, 'ResourceUpdated', $3::jsonb)`,
        [
          tenantId,
          resourceId,
          JSON.stringify({
            resource_id: resourceId,
            venue_id: venueId,
            name: updated.name,
            status: updated.status,
            bookable: updated.bookable,
          }),
        ],
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

  async deleteResource(
    venueId: string,
    resourceId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ deleted: boolean }> {
    const pool = getPool();

    const currentRes = await pool.query<{ id: string; tenant_id: string; name: string }>(
      `SELECT r.id, r.name, v.tenant_id
       FROM resources r
       JOIN venues v ON v.id = r.venue_id
       WHERE r.id = $1 AND r.venue_id = $2`,
      [resourceId, venueId],
    );
    if (currentRes.rowCount === 0) {
      throw notFound('Resource not found in this venue');
    }
    const { tenant_id: tenantId, name } = currentRes.rows[0];

    // Active or future claim guard
    const claimsCheck = await pool.query(
      `SELECT id FROM resource_claims
       WHERE resource_id = $1
         AND state IN ('ACTIVE_HOLD', 'CONFIRMED')
         AND upper(slot) > now()`,
      [resourceId],
    );
    if (claimsCheck.rowCount && claimsCheck.rowCount > 0) {
      throw conflict(
        'RESOURCE_HAS_ACTIVE_BOOKINGS',
        'Cannot delete resource with active holds or upcoming bookings. Set to MAINTENANCE or bookable=false instead.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove any resource component linkages
      await client.query(
        'DELETE FROM resource_components WHERE child_resource_id = $1 OR parent_resource_id = $1',
        [resourceId],
      );

      // Delete the resource
      await client.query(
        'DELETE FROM resources WHERE id = $1 AND venue_id = $2',
        [resourceId, venueId],
      );

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'RESOURCE_DELETED', 'RESOURCE', $5, $6, $7)`,
        [tenantId, venueId, actorId, actorRole, resourceId, `Deleted resource ${name}`, randomUUID()],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Resource', $2, 'ResourceDeleted', $3::jsonb)`,
        [
          tenantId,
          resourceId,
          JSON.stringify({
            resource_id: resourceId,
            venue_id: venueId,
            name,
          }),
        ],
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

  async bulkCloneResources(
    venueId: string,
    dto: BulkCloneDto,
    actorId: string,
    actorRole: string,
  ): Promise<ResourceRow[]> {
    const { count, prefix, startIndex, padLength = 2 } = dto.naming;
    if (!count || count < 1 || count > 100) {
      throw badRequest('BATCH_SIZE_EXCEEDED', 'Batch clone count must be between 1 and 100');
    }

    const pool = getPool();
    const venueRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rowCount === 0) {
      throw notFound('Venue not found');
    }
    const tenantId = venueRes.rows[0].tenant_id;

    // Validate room and zone if provided in template
    if (dto.template.roomId) {
      const roomCheck = await pool.query(
        'SELECT id FROM rooms WHERE id = $1 AND venue_id = $2',
        [dto.template.roomId, venueId],
      );
      if (roomCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Template room does not belong to this venue');
      }
    }
    if (dto.template.zoneId) {
      const zoneCheck = await pool.query(
        'SELECT id FROM zones WHERE id = $1 AND venue_id = $2',
        [dto.template.zoneId, venueId],
      );
      if (zoneCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Template zone does not belong to this venue');
      }
    }

    // Generate names
    const generatedNames: string[] = [];
    for (let i = startIndex; i < startIndex + count; i++) {
      const numStr = String(i).padStart(padLength, '0');
      generatedNames.push(`${prefix}${numStr}`);
    }

    // Name collision pre-check
    const existingCheck = await pool.query<{ name: string }>(
      'SELECT name FROM resources WHERE venue_id = $1 AND name = ANY($2)',
      [venueId, generatedNames],
    );
    if (existingCheck.rowCount && existingCheck.rowCount > 0) {
      const conflictNames = existingCheck.rows.map((r) => r.name).join(', ');
      throw conflict(
        'RESOURCE_NAME_EXISTS',
        `Generated resource names already exist in this venue: ${conflictNames}`,
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const createdResources: ResourceRow[] = [];
      for (const name of generatedNames) {
        const insertRes = await client.query<ResourceRow>(
          `INSERT INTO resources (venue_id, room_id, zone_id, type, name, attributes, bookable, status)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           RETURNING id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at`,
          [
            venueId,
            dto.template.roomId ?? null,
            dto.template.zoneId ?? null,
            dto.template.type,
            name,
            JSON.stringify(dto.template.attributes ?? {}),
            dto.template.bookable ?? true,
            dto.template.status ?? 'AVAILABLE',
          ],
        );
        createdResources.push(insertRes.rows[0]);
      }

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'RESOURCE_BULK_CREATED', 'RESOURCE', $5, $6, $7)`,
        [
          tenantId,
          venueId,
          actorId,
          actorRole,
          venueId,
          `Bulk cloned ${count} resources (${generatedNames[0]} to ${generatedNames[generatedNames.length - 1]})`,
          randomUUID(),
        ],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Venue', $2, 'ResourcesBulkCreated', $3::jsonb)`,
        [
          tenantId,
          venueId,
          JSON.stringify({
            venue_id: venueId,
            count,
            resource_ids: createdResources.map((r) => r.id),
          }),
        ],
      );

      await client.query('COMMIT');
      return createdResources;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkUpdateResources(
    venueId: string,
    dto: BulkUpdateDto,
    actorId: string,
    actorRole: string,
  ): Promise<BulkUpdateResult> {
    if (!dto.resource_ids || dto.resource_ids.length === 0) {
      throw badRequest('VALIDATION_FAILED', 'At least one resource ID is required');
    }

    const pool = getPool();
    const venueRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rowCount === 0) {
      throw notFound('Venue not found');
    }
    const tenantId = venueRes.rows[0].tenant_id;

    // Validate room and zone if provided
    if (dto.updates.roomId) {
      const roomCheck = await pool.query(
        'SELECT id FROM rooms WHERE id = $1 AND venue_id = $2',
        [dto.updates.roomId, venueId],
      );
      if (roomCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Target room does not belong to this venue');
      }
    }
    if (dto.updates.zoneId) {
      const zoneCheck = await pool.query(
        'SELECT id FROM zones WHERE id = $1 AND venue_id = $2',
        [dto.updates.zoneId, venueId],
      );
      if (zoneCheck.rowCount === 0) {
        throw badRequest('VALIDATION_FAILED', 'Target zone does not belong to this venue');
      }
    }

    // Sort IDs to prevent deadlocks across concurrent bulk operations
    const sortedIds = [...new Set(dto.resource_ids)].sort();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock matching rows
      const lockRes = await client.query<{ id: string }>(
        'SELECT id FROM resources WHERE id = ANY($1) AND venue_id = $2 ORDER BY id FOR UPDATE',
        [sortedIds, venueId],
      );

      if (lockRes.rowCount !== sortedIds.length) {
        throw notFound('One or more resources were not found in this venue');
      }

      // Execute bulk update
      const updateRes = await client.query<ResourceRow>(
        `UPDATE resources
         SET status = COALESCE($1, status),
             bookable = COALESCE($2, bookable),
             room_id = CASE WHEN $3::boolean THEN $4::uuid ELSE room_id END,
             zone_id = CASE WHEN $5::boolean THEN $6::uuid ELSE zone_id END,
             attributes = CASE WHEN $7::text IS NOT NULL THEN attributes || $7::jsonb ELSE attributes END,
             updated_at = now()
         WHERE id = ANY($8) AND venue_id = $9
         RETURNING id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at`,
        [
          dto.updates.status ?? null,
          dto.updates.bookable !== undefined ? dto.updates.bookable : null,
          dto.updates.roomId !== undefined,
          dto.updates.roomId ?? null,
          dto.updates.zoneId !== undefined,
          dto.updates.zoneId ?? null,
          dto.updates.attributes ? JSON.stringify(dto.updates.attributes) : null,
          sortedIds,
          venueId,
        ],
      );

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'RESOURCE_BULK_UPDATED', 'RESOURCE', $5, $6, $7)`,
        [
          tenantId,
          venueId,
          actorId,
          actorRole,
          venueId,
          `Bulk updated ${sortedIds.length} resources`,
          randomUUID(),
        ],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Venue', $2, 'ResourcesBulkUpdated', $3::jsonb)`,
        [
          tenantId,
          venueId,
          JSON.stringify({
            venue_id: venueId,
            updated_count: updateRes.rowCount,
            resource_ids: sortedIds,
          }),
        ],
      );

      await client.query('COMMIT');
      return {
        updated_count: updateRes.rowCount ?? 0,
        resources: updateRes.rows,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkImportResources(
    venueId: string,
    dto: BulkImportDto,
    actorId: string,
    actorRole: string,
  ): Promise<ResourceRow[]> {
    if (!dto.items || dto.items.length === 0) {
      throw badRequest('VALIDATION_FAILED', 'Import items array cannot be empty');
    }
    if (dto.items.length > 100) {
      throw badRequest('BATCH_SIZE_EXCEEDED', 'Cannot import more than 100 resources at once');
    }

    const pool = getPool();
    const venueRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rowCount === 0) {
      throw notFound('Venue not found');
    }
    const tenantId = venueRes.rows[0].tenant_id;

    // Check duplicate names within the import payload itself
    const names = dto.items.map((i) => (i.name ?? '').trim());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      throw badRequest('VALIDATION_FAILED', 'Duplicate resource names in import payload');
    }

    // Check duplicate names against existing database records
    const existingCheck = await pool.query<{ name: string }>(
      'SELECT name FROM resources WHERE venue_id = $1 AND name = ANY($2)',
      [venueId, names],
    );
    if (existingCheck.rowCount && existingCheck.rowCount > 0) {
      const conflictNames = existingCheck.rows.map((r) => r.name).join(', ');
      throw conflict(
        'RESOURCE_NAME_EXISTS',
        `Import contains names that already exist: ${conflictNames}`,
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const imported: ResourceRow[] = [];
      for (const item of dto.items) {
        const insertRes = await client.query<ResourceRow>(
          `INSERT INTO resources (venue_id, room_id, zone_id, type, name, attributes, bookable, status)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           RETURNING id, venue_id, room_id, zone_id, type, name, attributes, bookable, status, created_at, updated_at`,
          [
            venueId,
            item.roomId ?? null,
            item.zoneId ?? null,
            item.type,
            item.name.trim(),
            JSON.stringify(item.attributes ?? {}),
            item.bookable ?? true,
            item.status ?? 'AVAILABLE',
          ],
        );
        imported.push(insertRes.rows[0]);
      }

      // Audit
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, actor_id, actor_role, action, target_type, target_id, reason, request_id
        ) VALUES ($1, $2, $3, $4, 'RESOURCE_BULK_IMPORTED', 'RESOURCE', $5, $6, $7)`,
        [
          tenantId,
          venueId,
          actorId,
          actorRole,
          venueId,
          `Bulk imported ${imported.length} resources`,
          randomUUID(),
        ],
      );

      // Outbox
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'Venue', $2, 'ResourcesBulkImported', $3::jsonb)`,
        [
          tenantId,
          venueId,
          JSON.stringify({
            venue_id: venueId,
            count: imported.length,
            resource_ids: imported.map((r) => r.id),
          }),
        ],
      );

      await client.query('COMMIT');
      return imported;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
