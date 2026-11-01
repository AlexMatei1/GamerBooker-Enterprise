import { startTestApp, type TestApp } from './support/auth-harness';

interface Fixture {
  userId: string;
  cookie: string;
  tenantId: string;
  venueId: string;
}

async function createVenueWithRoles(
  app: TestApp,
  tenantName: string,
  venueName: string,
): Promise<{ owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string }> {
  const ownerUser = await app.verifiedUser();
  const tenant = await app.db.query<{ id: string }>(
    'INSERT INTO tenants (legal_name) VALUES ($1) RETURNING id',
    [tenantName],
  );
  const tenantId = tenant.rows[0].id;
  const venue = await app.db.query<{ id: string }>(
    "INSERT INTO venues (tenant_id, name, timezone, publication_state) VALUES ($1, $2, 'Europe/Bucharest', 'PUBLISHED') RETURNING id",
    [tenantId, venueName],
  );
  const venueId = venue.rows[0].id;

  // Owner
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [ownerUser.userId, venueId, tenantId, 'OWNER'],
  );
  await app.db.query(
    'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
      " VALUES ($1, 'totp', pgp_sym_encrypt('JBSWY3DPEHPK3PXP', 'test-mfa-key-0123456789abcdef0123456789'), now())" +
      ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
    [ownerUser.userId],
  );

  // Manager
  const managerUser = await app.verifiedUser();
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [managerUser.userId, venueId, tenantId, 'VENUE_MANAGER'],
  );
  await app.db.query(
    'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
      " VALUES ($1, 'totp', pgp_sym_encrypt('JBSWY3DPEHPK3PXP', 'test-mfa-key-0123456789abcdef0123456789'), now())" +
      ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
    [managerUser.userId],
  );

  // Reception
  const receptionUser = await app.verifiedUser();
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [receptionUser.userId, venueId, tenantId, 'RECEPTION'],
  );

  return {
    owner: { ...ownerUser, tenantId, venueId },
    manager: { ...managerUser, tenantId, venueId },
    reception: { ...receptionUser, tenantId, venueId },
    venueId,
    tenantId,
  };
}

describe('ENG-203 Free-Form Geometry Scene, Editor Layers, Multi-Room and Presets', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let foreignFixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let primaryRoomId: string;
  let secondaryRoomId: string;
  let pc1Id: string;
  let pc2Id: string;

  beforeAll(async () => {
    app = await startTestApp('eng203');
    fixtures = await createVenueWithRoles(app, 'Nexus Gaming Arena SRL', 'Nexus Bucharest');
    foreignFixtures = await createVenueWithRoles(app, 'CyberZone Corp', 'CyberZone Cluj');

    // Seed existing rooms and resources in venue
    const r1Res = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Esports Stage'],
    );
    primaryRoomId = r1Res.rows[0].id;

    const r2Res = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Casual Lounge'],
    );
    secondaryRoomId = r2Res.rows[0].id;

    const res1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'STATION-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, primaryRoomId],
    );
    pc1Id = res1.rows[0].id;

    const res2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'STATION-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, primaryRoomId],
    );
    pc2Id = res2.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Draft Initialization & Layout Retrieval', () => {
    it('automatically initializes a default draft seeded with existing venue rooms and resources', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      const draft = (res.json as any).draft;
      expect(draft).toBeDefined();
      expect(draft.revision).toBe(1);
      expect(draft.schema_version).toBe(1);
      expect(draft.canvas.width).toBe(1600);
      expect(draft.canvas.height).toBe(1000);
      expect(draft.canvas.grid).toBe(20);

      // Verify layers
      expect(draft.layers.length).toBe(5);
      expect(draft.layers.some((l: any) => l.id === 'walls')).toBe(true);
      expect(draft.layers.some((l: any) => l.id === 'equipment')).toBe(true);
      expect(draft.layers.some((l: any) => l.id === 'furniture')).toBe(true);

      // Verify rooms
      expect(draft.rooms.length).toBe(2);
      expect(draft.rooms.some((r: any) => r.name === 'Esports Stage')).toBe(true);
      expect(draft.rooms.some((r: any) => r.name === 'Casual Lounge')).toBe(true);

      // Verify resources placed as nodes
      expect(draft.nodes.length).toBeGreaterThanOrEqual(2);
      const node1 = draft.nodes.find((n: any) => n.resource_id === pc1Id);
      expect(node1).toBeDefined();
      expect(node1.kind).toBe('RESOURCE');
      expect(node1.layer_id).toBe('equipment');
      expect(node1.label).toBe('STATION-01');
    });

    it('allows RECEPTION staff to read the layout draft (read-only)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      expect((res.json as any).draft.revision).toBe(1);
    });

    it('rejects cross-tenant access with 404 RESOURCE_NOT_FOUND', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${foreignFixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('Draft Mutation & Optimistic Concurrency', () => {
    it('updates draft with walls, doors, decor, and furniture, bumping revision from 1 to 2', async () => {
      const updatePayload = {
        expected_revision: 1,
        canvas: { width: 1800, height: 1200, grid: 25 },
        rooms: [
          {
            id: primaryRoomId,
            name: 'Arena Main Stage',
            shape: { kind: 'rect', x: 50, y: 50, w: 700, h: 500 },
          },
          {
            id: secondaryRoomId,
            name: 'Streamer Pods',
            shape: { kind: 'rect', x: 800, y: 50, w: 400, h: 500 },
          },
        ],
        nodes: [
          {
            id: 'wall-perimeter-01',
            kind: 'WALL',
            layer_id: 'walls',
            room_id: primaryRoomId,
            x: 50,
            y: 50,
            w: 700,
            h: 15,
          },
          {
            id: 'door-entry-01',
            kind: 'DOOR',
            layer_id: 'walls',
            room_id: primaryRoomId,
            x: 200,
            y: 50,
            w: 80,
            h: 15,
            custom_props: { swing: 'outward' },
          },
          {
            id: 'desk-stage-01',
            kind: 'FURNITURE',
            layer_id: 'furniture',
            room_id: primaryRoomId,
            x: 100,
            y: 120,
            w: 120,
            h: 60,
          },
          {
            id: `pc-node-${pc1Id.slice(0, 8)}`,
            kind: 'RESOURCE',
            layer_id: 'equipment',
            room_id: primaryRoomId,
            resource_id: pc1Id,
            x: 125,
            y: 130,
            w: 60,
            h: 40,
            label: 'STATION-01',
          },
          {
            id: 'sponsor-banner-01',
            kind: 'DECOR',
            layer_id: 'labels',
            room_id: primaryRoomId,
            x: 400,
            y: 70,
            w: 200,
            h: 40,
            label: 'ROG ROGUE ZONE',
          },
        ],
        metadata: { theme: 'cyberpunk_neon', designer: 'Alex' },
      };

      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.manager.cookie, 'x-request-id': 'req-update-draft-1' },
          body: updatePayload,
        },
      );

      expect(res.status).toBe(200);
      const updated = (res.json as any).draft;
      expect(updated.revision).toBe(2);
      expect(updated.canvas.width).toBe(1800);
      expect(updated.rooms.length).toBe(2);
      expect(updated.nodes.length).toBe(5);
      expect(updated.metadata.theme).toBe('cyberpunk_neon');

      // Check DB audit event
      const auditRes = await app.db.query<{ action: string; target_type: string }>(
        "SELECT action, target_type FROM audit_events WHERE venue_id = $1 AND action = 'LAYOUT_DRAFT_UPDATED' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].target_type).toBe('LAYOUT_DRAFT');

      // Check transactional outbox event
      const outboxRes = await app.db.query<{ event_type: string }>(
        "SELECT event_type FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'LayoutDraftUpdated' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(outboxRes.rowCount).toBe(1);
    });

    it('rejects update with stale expected_revision (409 LAYOUT_REVISION_CONFLICT)', async () => {
      // Current revision is 2, sending expected_revision = 1
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_revision: 1,
            canvas: { width: 1900 },
          },
        },
      );

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('LAYOUT_REVISION_CONFLICT');
    });

    it('rejects update from RECEPTION role (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            expected_revision: 2,
            canvas: { width: 1900 },
          },
        },
      );

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });

  describe('Geometry & Schema Validations', () => {
    it('rejects negative room coordinates with 400 INVALID_ROOM_COORDINATES', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_revision: 2,
            rooms: [
              {
                id: primaryRoomId,
                name: 'Invalid Room',
                shape: { kind: 'rect', x: -10, y: 50, w: 400, h: 400 },
              },
            ],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_ROOM_COORDINATES');
    });

    it('rejects negative node coordinates with 400 NEGATIVE_NODE_COORDINATES', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_revision: 2,
            nodes: [
              {
                id: 'bad-coord-node',
                kind: 'WALL',
                layer_id: 'walls',
                x: 100,
                y: -50,
              },
            ],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('NEGATIVE_NODE_COORDINATES');
    });

    it('rejects duplicate node IDs within scene with 400 DUPLICATE_NODE_ID', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_revision: 2,
            nodes: [
              {
                id: 'duplicate-id-1',
                kind: 'WALL',
                layer_id: 'walls',
                x: 100,
                y: 100,
              },
              {
                id: 'duplicate-id-1',
                kind: 'DECOR',
                layer_id: 'labels',
                x: 200,
                y: 200,
              },
            ],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('DUPLICATE_NODE_ID');
    });

    it('rejects invalid canvas dimensions with 400 INVALID_CANVAS_WIDTH', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_revision: 2,
            canvas: { width: 50 }, // below min 200
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_CANVAS_WIDTH');
    });
  });

  describe('Presets Catalog & Generator Engine', () => {
    it('returns the catalog of 5 standard layout presets', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/presets`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const presets = (res.json as any).presets;
      expect(presets.length).toBe(5);
      const types = presets.map((p: any) => p.type);
      expect(types).toContain('ROW_PCS');
      expect(types).toContain('ESPORTS_5V5');
      expect(types).toContain('CONSOLE_LOUNGE');
      expect(types).toContain('VIP_U_SHAPE');
      expect(types).toContain('PRIVATE_ROOM');
    });

    it('generates a ROW_PCS preset with 5 stations, desks, chairs, and bounding box', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/presets/generate`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            template_type: 'ROW_PCS',
            start_x: 60,
            start_y: 60,
            room_id: primaryRoomId,
            naming_prefix: 'STATION-',
            count: 5,
          },
        },
      );

      expect(res.status).toBe(200);
      const gen = res.json as any;
      expect(gen.nodes).toBeDefined();
      // 5 desks + 5 PCs + 5 chairs = 15 nodes
      expect(gen.nodes.length).toBe(15);
      expect(gen.bounding_box.w).toBeGreaterThanOrEqual(500);

      const pcNodes = gen.nodes.filter((n: any) => n.kind === 'RESOURCE');
      expect(pcNodes.length).toBe(5);
      expect(pcNodes[0].label).toBe('STATION-01');
      expect(pcNodes[4].label).toBe('STATION-05');
    });

    it('generates an ESPORTS_5V5 mirrored arena preset with opposing teams and 180° rotation', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/presets/generate`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            template_type: 'ESPORTS_5V5',
            start_x: 100,
            start_y: 100,
            room_id: primaryRoomId,
          },
        },
      );

      expect(res.status).toBe(200);
      const gen = res.json as any;
      // 2 team labels + 10 desks + 10 PCs = 22 nodes
      expect(gen.nodes.length).toBe(22);

      const labels = gen.nodes.filter((n: any) => n.kind === 'LABEL');
      expect(labels.length).toBe(2);
      expect(labels.some((l: any) => l.label === 'TEAM BLUE')).toBe(true);
      expect(labels.some((l: any) => l.label === 'TEAM RED')).toBe(true);

      const team2PCs = gen.nodes.filter((n: any) => n.kind === 'RESOURCE' && n.rotation === 180);
      expect(team2PCs.length).toBe(5);
    });

    it('generates a PRIVATE_ROOM preset with walls, entry door, suite node, and interior PCs', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/presets/generate`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            template_type: 'PRIVATE_ROOM',
            start_x: 200,
            start_y: 200,
            room_id: secondaryRoomId,
          },
        },
      );

      expect(res.status).toBe(200);
      const gen = res.json as any;
      // 5 wall segments + 1 door + 1 private room suite + 4 desks + 4 PCs = 15 nodes
      expect(gen.nodes.length).toBe(15);

      const doors = gen.nodes.filter((n: any) => n.kind === 'DOOR');
      expect(doors.length).toBe(1);
      expect(doors[0].custom_props.lock_type).toBe('rfid_keycard');

      const suiteNode = gen.nodes.find((n: any) => n.custom_props?.category === 'PRIVATE_ROOM');
      expect(suiteNode).toBeDefined();
      expect(suiteNode.label).toBe('VIP Private Suite');
    });
  });

  describe('Draft Reset Lifecycle', () => {
    it('resets draft to baseline revision 1 seeded from DB rooms/resources', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/draft/reset`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      expect((res.json as any).reset).toBe(true);
      const draft = (res.json as any).draft;
      expect(draft.revision).toBe(1);

      // Verify DB audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE venue_id = $1 AND action = 'LAYOUT_DRAFT_RESET' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
    });
  });
});
