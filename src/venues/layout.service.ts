import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import {
  LayoutDraft,
  UpdateDraftDto,
  PresetCatalogItem,
  GeneratePresetDto,
  GeneratedPresetResult,
  SceneNode,
  SceneRoom,
  SceneLayer,
  SceneCanvas,
} from './layout.types';

function notFound(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, code, message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message, details);
}

/** Raw `layout_drafts` row as returned by node-postgres. */
interface LayoutDraftRow {
  id: string;
  venue_id: string;
  revision: string | number;
  schema_version: string | number;
  canvas: unknown;
  rooms: unknown;
  layers: unknown;
  nodes: unknown;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  updated_by: string | null;
}

/** Decodes a JSONB column that may arrive parsed or as a string. */
function decodeJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

@Injectable()
export class LayoutService {
  private readonly defaultLayers: SceneLayer[] = [
    { id: 'background', name: 'Background', visible: true, locked: false },
    { id: 'walls', name: 'Walls & Doors', visible: true, locked: false },
    { id: 'furniture', name: 'Furniture & Desks', visible: true, locked: false },
    { id: 'equipment', name: 'Equipment', visible: true, locked: false },
    { id: 'labels', name: 'Labels & Text', visible: true, locked: false },
  ];

  async getDraft(venueId: string): Promise<LayoutDraft> {
    const pool = getPool();
    const existing = await pool.query<LayoutDraftRow>(
      `SELECT ld.*
       FROM layout_drafts ld
       WHERE ld.venue_id = $1`,
      [venueId],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return this.mapDraftRow(existing.rows[0]);
    }

    // Auto-initialize default draft from existing DB rooms and resources
    return this.initializeDraft(venueId);
  }

  async updateDraft(
    venueId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateDraftDto,
    requestId: string,
  ): Promise<LayoutDraft> {
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

      const existingRes = await client.query<LayoutDraftRow>(
        `SELECT ld.*
         FROM layout_drafts ld
         WHERE ld.venue_id = $1
         FOR UPDATE`,
        [venueId],
      );

      let currentDraft: LayoutDraft;
      if (!existingRes.rowCount || existingRes.rowCount === 0) {
        currentDraft = await this.initializeDraftWithClient(client, venueId, tenantId);
      } else {
        currentDraft = this.mapDraftRow(existingRes.rows[0]);
      }

      // Optimistic Concurrency Check
      if (dto.expected_revision !== currentDraft.revision) {
        throw conflict(
          'LAYOUT_REVISION_CONFLICT',
          `Draft revision conflict. Expected ${dto.expected_revision}, but current revision is ${currentDraft.revision}.`,
          {
            current_revision: currentDraft.revision,
            expected_revision: dto.expected_revision,
          },
        );
      }

      // Geometry & Schema Validation
      this.validateSceneData(dto, currentDraft.canvas);

      const newCanvas: SceneCanvas = {
        ...currentDraft.canvas,
        ...(dto.canvas || {}),
      };
      const newRooms: SceneRoom[] = dto.rooms ?? currentDraft.rooms;
      const newLayers: SceneLayer[] = dto.layers ?? currentDraft.layers;
      const newNodes: SceneNode[] = dto.nodes ?? currentDraft.nodes;
      const newMetadata = dto.metadata ?? currentDraft.metadata;
      const nextRevision = currentDraft.revision + 1;

      const updatedRes = await client.query<LayoutDraftRow>(
        `UPDATE layout_drafts
         SET revision = $1,
             canvas = $2,
             rooms = $3,
             layers = $4,
             nodes = $5,
             metadata = $6,
             updated_at = now(),
             updated_by = $7
         WHERE venue_id = $8
         RETURNING *`,
        [
          nextRevision,
          JSON.stringify(newCanvas),
          JSON.stringify(newRooms),
          JSON.stringify(newLayers),
          JSON.stringify(newNodes),
          JSON.stringify(newMetadata),
          actorId,
          venueId,
        ],
      );

      // Append-only audit logging
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'LAYOUT_DRAFT_UPDATED', 'LAYOUT_DRAFT', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          updatedRes.rows[0].id,
          JSON.stringify({
            previous_revision: currentDraft.revision,
            new_revision: nextRevision,
            nodes_count: newNodes.length,
            rooms_count: newRooms.length,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'LayoutDraft', $2, 'LayoutDraftUpdated', $3)`,
        [
          tenantId,
          venueId,
          JSON.stringify({
            venue_id: venueId,
            revision: nextRevision,
            updated_by: actorId,
            updated_at: new Date().toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');
      return this.mapDraftRow(updatedRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async resetDraft(
    venueId: string,
    actorId: string,
    actorRole: string,
    requestId: string,
  ): Promise<LayoutDraft> {
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

      await client.query('DELETE FROM layout_drafts WHERE venue_id = $1', [venueId]);

      const freshDraft = await this.initializeDraftWithClient(client, venueId, tenantId, actorId);

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'LAYOUT_DRAFT_RESET', 'LAYOUT_DRAFT', $6, $7)`,
        [
          tenantId,
          venueId,
          requestId || randomUUID(),
          actorId,
          actorRole,
          freshDraft.id,
          JSON.stringify({ reset_to_revision: 1 }),
        ],
      );

      await client.query('COMMIT');
      return freshDraft;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  listPresets(): PresetCatalogItem[] {
    return [
      {
        type: 'ROW_PCS',
        name: 'Row of PCs',
        description: 'Linear bank of PC gaming stations with desks and chairs.',
        default_count: 5,
        min_count: 2,
        max_count: 20,
        required_dimensions: { w: 600, h: 140 },
      },
      {
        type: 'ESPORTS_5V5',
        name: '5v5 Esports Arena Pod',
        description: 'Two opposing rows of 5 PCs with team partitions and stage desks.',
        default_count: 10,
        min_count: 10,
        max_count: 10,
        required_dimensions: { w: 750, h: 360 },
      },
      {
        type: 'CONSOLE_LOUNGE',
        name: 'Console Lounge Booth',
        description: 'Cozy console setup with sofa couch, coffee table, and wide display stand.',
        default_count: 1,
        min_count: 1,
        max_count: 4,
        required_dimensions: { w: 260, h: 220 },
      },
      {
        type: 'VIP_U_SHAPE',
        name: 'VIP U-Shape Suite',
        description: 'Enclosed U-shaped premium station arrangement for private groups.',
        default_count: 6,
        min_count: 4,
        max_count: 10,
        required_dimensions: { w: 500, h: 400 },
      },
      {
        type: 'PRIVATE_ROOM',
        name: 'Private Gaming Room Enclosure',
        description: 'Four perimeter walls, entry door, lighting decor, and central gaming desks.',
        default_count: 4,
        min_count: 2,
        max_count: 8,
        required_dimensions: { w: 600, h: 500 },
      },
    ];
  }

  generatePreset(dto: GeneratePresetDto): GeneratedPresetResult {
    const startX = dto.start_x || 40;
    const startY = dto.start_y || 40;
    const roomId = dto.room_id;
    const prefix = dto.naming_prefix || 'PC-';
    const nodes: SceneNode[] = [];

    switch (dto.template_type) {
      case 'ROW_PCS': {
        const count = Math.min(Math.max(dto.count || 5, 2), 20);
        const deskW = 100;
        const deskH = 60;
        const gap = dto.spacing || 10;

        for (let i = 0; i < count; i++) {
          const x = startX + i * (deskW + gap);
          const y = startY;
          const label = `${prefix}${String(i + 1).padStart(2, '0')}`;

          nodes.push({
            id: `desk-${randomUUID().slice(0, 8)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x,
            y,
            w: deskW,
            h: deskH,
            custom_props: { type: 'DESK', material: 'carbon_black' },
          });

          nodes.push({
            id: `res-node-${randomUUID().slice(0, 8)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: x + 20,
            y: y + 10,
            w: 60,
            h: 40,
            label,
            custom_props: { category: 'PC' },
          });

          nodes.push({
            id: `chair-${randomUUID().slice(0, 8)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x: x + 30,
            y: y + deskH + 5,
            w: 40,
            h: 40,
            custom_props: { type: 'CHAIR', ergonomy: 'gaming' },
          });
        }

        const totalW = count * deskW + (count - 1) * gap;
        return {
          nodes,
          bounding_box: { x: startX, y: startY, w: totalW, h: deskH + 50 },
        };
      }

      case 'ESPORTS_5V5': {
        const deskW = 110;
        const deskH = 60;
        const gap = 10;
        const rowGap = 120;

        // Team 1 (North)
        nodes.push({
          id: `label-team1-${randomUUID().slice(0, 8)}`,
          kind: 'LABEL',
          layer_id: 'labels',
          room_id: roomId,
          x: startX + 220,
          y: startY - 25,
          label: 'TEAM BLUE',
          color: '#3b82f6',
        });

        for (let i = 0; i < 5; i++) {
          const x = startX + i * (deskW + gap);
          const y = startY;
          const label = `T1-PC${i + 1}`;

          nodes.push({
            id: `t1-desk-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x,
            y,
            w: deskW,
            h: deskH,
            custom_props: { team: 'blue' },
          });

          nodes.push({
            id: `t1-res-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: x + 25,
            y: y + 10,
            w: 60,
            h: 40,
            label,
            custom_props: { category: 'PC', spec: 'PRO_STAGE' },
          });
        }

        // Team 2 (South, facing North)
        const t2Y = startY + deskH + rowGap;
        nodes.push({
          id: `label-team2-${randomUUID().slice(0, 8)}`,
          kind: 'LABEL',
          layer_id: 'labels',
          room_id: roomId,
          x: startX + 220,
          y: t2Y + deskH + 15,
          label: 'TEAM RED',
          color: '#ef4444',
        });

        for (let i = 0; i < 5; i++) {
          const x = startX + i * (deskW + gap);
          const y = t2Y;
          const label = `T2-PC${i + 1}`;

          nodes.push({
            id: `t2-desk-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x,
            y,
            w: deskW,
            h: deskH,
            custom_props: { team: 'red' },
          });

          nodes.push({
            id: `t2-res-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: x + 25,
            y: y + 10,
            w: 60,
            h: 40,
            label,
            rotation: 180,
            custom_props: { category: 'PC', spec: 'PRO_STAGE' },
          });
        }

        const arenaW = 5 * deskW + 4 * gap;
        const arenaH = 2 * deskH + rowGap + 50;
        return {
          nodes,
          bounding_box: { x: startX, y: startY - 30, w: arenaW, h: arenaH },
        };
      }

      case 'CONSOLE_LOUNGE': {
        const tvX = startX + 30;
        const tvY = startY;

        nodes.push({
          id: `tv-stand-${randomUUID().slice(0, 8)}`,
          kind: 'FURNITURE',
          layer_id: 'furniture',
          room_id: roomId,
          x: tvX,
          y: tvY,
          w: 160,
          h: 30,
          custom_props: { type: 'TV_CONSOLE_STAND' },
        });

        nodes.push({
          id: `console-res-${randomUUID().slice(0, 8)}`,
          kind: 'RESOURCE',
          layer_id: 'equipment',
          room_id: roomId,
          x: tvX + 45,
          y: tvY + 5,
          w: 70,
          h: 25,
          label: `${prefix}PS5-01`,
          custom_props: { category: 'CONSOLE_SETUP' },
        });

        nodes.push({
          id: `coffee-table-${randomUUID().slice(0, 8)}`,
          kind: 'FURNITURE',
          layer_id: 'furniture',
          room_id: roomId,
          x: tvX + 20,
          y: tvY + 60,
          w: 120,
          h: 40,
          custom_props: { type: 'TABLE' },
        });

        nodes.push({
          id: `couch-${randomUUID().slice(0, 8)}`,
          kind: 'FURNITURE',
          layer_id: 'furniture',
          room_id: roomId,
          x: tvX - 10,
          y: tvY + 120,
          w: 180,
          h: 60,
          custom_props: { type: 'LEATHER_SOFA', seats: 4 },
        });

        return {
          nodes,
          bounding_box: { x: startX, y: startY, w: 220, h: 200 },
        };
      }

      case 'VIP_U_SHAPE': {
        const uW = 400;
        const uH = 300;

        for (let i = 0; i < 2; i++) {
          nodes.push({
            id: `vip-desk-top-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x: startX + 90 + i * 110,
            y: startY,
            w: 100,
            h: 50,
          });
          nodes.push({
            id: `vip-pc-top-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: startX + 110 + i * 110,
            y: startY + 10,
            w: 60,
            h: 30,
            label: `VIP-${i + 1}`,
          });
        }

        for (let i = 0; i < 2; i++) {
          nodes.push({
            id: `vip-desk-left-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x: startX,
            y: startY + 60 + i * 100,
            w: 50,
            h: 90,
          });
          nodes.push({
            id: `vip-pc-left-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: startX + 10,
            y: startY + 80 + i * 100,
            w: 30,
            h: 50,
            rotation: 90,
            label: `VIP-${i + 3}`,
          });
        }

        for (let i = 0; i < 2; i++) {
          nodes.push({
            id: `vip-desk-right-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x: startX + uW - 50,
            y: startY + 60 + i * 100,
            w: 50,
            h: 90,
          });
          nodes.push({
            id: `vip-pc-right-${i}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: startX + uW - 40,
            y: startY + 80 + i * 100,
            w: 30,
            h: 50,
            rotation: 270,
            label: `VIP-${i + 5}`,
          });
        }

        return {
          nodes,
          bounding_box: { x: startX, y: startY, w: uW, h: uH },
        };
      }

      case 'PRIVATE_ROOM': {
        const roomW = 500;
        const roomH = 380;
        const wallThick = 12;

        nodes.push({
          id: `wall-north-${randomUUID().slice(0, 6)}`,
          kind: 'WALL',
          layer_id: 'walls',
          room_id: roomId,
          x: startX,
          y: startY,
          w: roomW,
          h: wallThick,
        });

        nodes.push({
          id: `wall-west-${randomUUID().slice(0, 6)}`,
          kind: 'WALL',
          layer_id: 'walls',
          room_id: roomId,
          x: startX,
          y: startY + wallThick,
          w: wallThick,
          h: roomH - 2 * wallThick,
        });

        nodes.push({
          id: `wall-east-${randomUUID().slice(0, 6)}`,
          kind: 'WALL',
          layer_id: 'walls',
          room_id: roomId,
          x: startX + roomW - wallThick,
          y: startY + wallThick,
          w: wallThick,
          h: roomH - 2 * wallThick,
        });

        nodes.push({
          id: `wall-south-left-${randomUUID().slice(0, 6)}`,
          kind: 'WALL',
          layer_id: 'walls',
          room_id: roomId,
          x: startX,
          y: startY + roomH - wallThick,
          w: 180,
          h: wallThick,
        });

        nodes.push({
          id: `door-south-${randomUUID().slice(0, 6)}`,
          kind: 'DOOR',
          layer_id: 'walls',
          room_id: roomId,
          x: startX + 180,
          y: startY + roomH - wallThick,
          w: 80,
          h: wallThick,
          custom_props: { swing: 'inward', lock_type: 'rfid_keycard' },
        });

        nodes.push({
          id: `wall-south-right-${randomUUID().slice(0, 6)}`,
          kind: 'WALL',
          layer_id: 'walls',
          room_id: roomId,
          x: startX + 260,
          y: startY + roomH - wallThick,
          w: roomW - 260,
          h: wallThick,
        });

        nodes.push({
          id: `priv-suite-${randomUUID().slice(0, 8)}`,
          kind: 'RESOURCE',
          layer_id: 'equipment',
          room_id: roomId,
          x: startX + 40,
          y: startY + 30,
          w: 120,
          h: 40,
          label: 'VIP Private Suite',
          custom_props: { category: 'PRIVATE_ROOM' },
        });

        for (let i = 0; i < 4; i++) {
          const x = startX + 60 + i * 95;
          const y = startY + 120;
          nodes.push({
            id: `priv-desk-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: roomId,
            x,
            y,
            w: 85,
            h: 55,
          });
          nodes.push({
            id: `priv-pc-${i + 1}-${randomUUID().slice(0, 6)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: roomId,
            x: x + 15,
            y: y + 10,
            w: 55,
            h: 35,
            label: `SUITE-PC${i + 1}`,
          });
        }

        return {
          nodes,
          bounding_box: { x: startX, y: startY, w: roomW, h: roomH },
        };
      }
    }
  }

  private validateSceneData(dto: UpdateDraftDto, _currentCanvas: SceneCanvas): void {
    if (dto.canvas) {
      if (typeof dto.canvas.width === 'number' && dto.canvas.width < 200) {
        throw badRequest('INVALID_CANVAS_WIDTH', 'Canvas width must be at least 200 units');
      }
      if (typeof dto.canvas.height === 'number' && dto.canvas.height < 200) {
        throw badRequest('INVALID_CANVAS_HEIGHT', 'Canvas height must be at least 200 units');
      }
      if (typeof dto.canvas.grid === 'number' && dto.canvas.grid < 1) {
        throw badRequest('INVALID_GRID_SIZE', 'Grid size must be positive');
      }
    }

    if (dto.rooms) {
      for (const room of dto.rooms) {
        if (!room.id || !room.name || !room.shape) {
          throw badRequest('INVALID_ROOM_STRUCTURE', 'Rooms must specify id, name, and shape');
        }
        if (room.shape.x < 0 || room.shape.y < 0) {
          throw badRequest('INVALID_ROOM_COORDINATES', `Room "${room.name}" cannot have negative coordinates`);
        }
      }
    }

    if (dto.nodes) {
      const seenIds = new Set<string>();
      for (const node of dto.nodes) {
        if (!node.id || !node.kind || !node.layer_id) {
          throw badRequest('INVALID_NODE_STRUCTURE', 'All scene nodes must provide id, kind, and layer_id');
        }
        if (seenIds.has(node.id)) {
          throw badRequest('DUPLICATE_NODE_ID', `Duplicate node ID "${node.id}" detected in scene`);
        }
        seenIds.add(node.id);

        if (node.x < 0 || node.y < 0) {
          throw badRequest('NEGATIVE_NODE_COORDINATES', `Node "${node.id}" coordinates must be non-negative`);
        }
      }
    }
  }

  private async initializeDraft(venueId: string): Promise<LayoutDraft> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const venueRes = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (!venueRes.rowCount || venueRes.rowCount === 0) {
        throw notFound('VENUE_NOT_FOUND', 'Venue not found or inaccessible');
      }
      const draft = await this.initializeDraftWithClient(client, venueId, venueRes.rows[0].tenant_id);
      await client.query('COMMIT');
      return draft;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async initializeDraftWithClient(
    client: PoolClient,
    venueId: string,
    tenantId: string,
    actorId?: string,
  ): Promise<LayoutDraft> {
    const roomsRes = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM rooms WHERE venue_id = $1 ORDER BY created_at ASC',
      [venueId],
    );

    const resourcesRes = await client.query<{
      id: string;
      name: string;
      type: string;
      room_id: string | null;
      zone_id: string | null;
    }>('SELECT id, name, type, room_id, zone_id FROM resources WHERE venue_id = $1 ORDER BY name ASC', [
      venueId,
    ]);

    const sceneRooms: SceneRoom[] = [];
    const sceneNodes: SceneNode[] = [];

    const roomW = 500;
    const roomH = 400;
    const margin = 40;

    if (roomsRes.rowCount && roomsRes.rowCount > 0) {
      roomsRes.rows.forEach((r: { id: string; name: string }, idx: number) => {
        const x = margin + idx * (roomW + margin);
        const y = margin;
        sceneRooms.push({
          id: r.id,
          name: r.name,
          shape: {
            kind: 'rect',
            x,
            y,
            w: roomW,
            h: roomH,
          },
        });
      });
    } else {
      sceneRooms.push({
        id: randomUUID(),
        name: 'Main Gaming Hall',
        shape: {
          kind: 'rect',
          x: margin,
          y: margin,
          w: 800,
          h: 600,
        },
      });
    }

    const primaryRoomId = sceneRooms[0]?.id;
    let currX = 60;
    let currY = 80;

    for (const res of resourcesRes.rows) {
      const targetRoomId = res.room_id || primaryRoomId;
      sceneNodes.push({
        id: `node-${res.id.slice(0, 8)}`,
        kind: 'RESOURCE',
        layer_id: 'equipment',
        room_id: targetRoomId,
        x: currX,
        y: currY,
        w: 60,
        h: 40,
        resource_id: res.id,
        label: res.name,
        custom_props: { category: res.type },
      });

      currX += 80;
      if (currX > 400) {
        currX = 60;
        currY += 70;
      }
    }

    const initialCanvas: SceneCanvas = { width: 1600, height: 1000, grid: 20 };

    const insertRes = await client.query<LayoutDraftRow>(
      `INSERT INTO layout_drafts (
        venue_id, revision, schema_version, canvas, rooms, layers, nodes, updated_by
      ) VALUES ($1, 1, 1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        venueId,
        JSON.stringify(initialCanvas),
        JSON.stringify(sceneRooms),
        JSON.stringify(this.defaultLayers),
        JSON.stringify(sceneNodes),
        actorId || null,
      ],
    );

    return this.mapDraftRow(insertRes.rows[0]);
  }

  private mapDraftRow(row: LayoutDraftRow): LayoutDraft {
    return {
      id: row.id,
      venue_id: row.venue_id,
      revision: Number(row.revision),
      schema_version: Number(row.schema_version),
      canvas: decodeJson<SceneCanvas>(row.canvas),
      rooms: decodeJson<SceneRoom[]>(row.rooms),
      layers: decodeJson<SceneLayer[]>(row.layers),
      nodes: decodeJson<SceneNode[]>(row.nodes),
      metadata: decodeJson<Record<string, unknown>>(row.metadata),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      updated_by: row.updated_by || null,
    };
  }
}
