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

describe('ENG-204 Resource Inspector, Adjacency Edges, and Private Room Composition', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let foreignFixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };

  let mainRoomId: string;
  let vipRoomId: string;
  let vipZoneId: string;
  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;
  let privateRoomResourceId: string;
  let secondPrivateRoomId: string;

  beforeAll(async () => {
    app = await startTestApp('eng204');
    fixtures = await createVenueWithRoles(app, 'CyberArena Operations SRL', 'CyberArena Bucharest');
    foreignFixtures = await createVenueWithRoles(app, 'ArcadeWorld SRL', 'Arcade Brasov');

    // 1. Seed Rooms
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Tournament Stage'],
    );
    mainRoomId = r1.rows[0].id;

    const r2 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'VIP Suite Hall'],
    );
    vipRoomId = r2.rows[0].id;

    // 2. Seed Policy Profile & Zone
    const polRes = await app.db.query<{ id: string }>(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'VIP Premium Policy', true, '{"cancellation_cutoff_hours": 4, "deposit_percentage": 50, "min_duration_minutes": 60, "max_duration_minutes": 360}')
       RETURNING id`,
      [fixtures.venueId],
    );
    const policyProfileId = polRes.rows[0].id;

    const znRes = await app.db.query<{ id: string }>(
      'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [fixtures.venueId, mainRoomId, 'Pro Gaming Zone', policyProfileId],
    );
    vipZoneId = znRes.rows[0].id;

    // 3. Seed Price Rules
    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency) VALUES ($1, 'ZONE', $2, 3500, 'RON')",
      [fixtures.venueId, vipZoneId],
    );

    // 4. Seed Resources
    const p1 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable, attributes)
       VALUES ($1, $2, $3, 'PC', 'PRO-STATION-01', 'AVAILABLE', true, '{"gpu": "RTX 4090", "cpu": "i9-14900K", "ram": "64GB"}')
       RETURNING id`,
      [fixtures.venueId, mainRoomId, vipZoneId],
    );
    pc1Id = p1.rows[0].id;

    const p2 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable, attributes)
       VALUES ($1, $2, $3, 'PC', 'PRO-STATION-02', 'AVAILABLE', true, '{"gpu": "RTX 4090", "cpu": "i9-14900K", "ram": "64GB"}')
       RETURNING id`,
      [fixtures.venueId, mainRoomId, vipZoneId],
    );
    pc2Id = p2.rows[0].id;

    const p3 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable, attributes)
       VALUES ($1, $2, $3, 'PC', 'PRO-STATION-03', 'AVAILABLE', true, '{"gpu": "RTX 4080", "cpu": "i7-14700K"}')
       RETURNING id`,
      [fixtures.venueId, mainRoomId, vipZoneId],
    );
    pc3Id = p3.rows[0].id;

    // 5. Seed Private Room Resources
    const priv1 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PRIVATE_ROOM', 'VIP Gaming Suite Alpha', 'AVAILABLE', true)
       RETURNING id`,
      [fixtures.venueId, vipRoomId],
    );
    privateRoomResourceId = priv1.rows[0].id;

    const priv2 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PRIVATE_ROOM', 'VIP Gaming Suite Beta', 'AVAILABLE', true)
       RETURNING id`,
      [fixtures.venueId, vipRoomId],
    );
    secondPrivateRoomId = priv2.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  // ===========================================================================
  // 1. Resource Inspector
  // ===========================================================================
  describe('Resource Inspector', () => {
    it('retrieves detailed inspector metadata with resolved pricing, policy, and specs', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const inspector = (res.json as any).inspector;
      expect(inspector.id).toBe(pc1Id);
      expect(inspector.name).toBe('PRO-STATION-01');
      expect(inspector.type).toBe('PC');
      expect(inspector.room.name).toBe('Tournament Stage');
      expect(inspector.zone.name).toBe('Pro Gaming Zone');
      expect(inspector.attributes.gpu).toBe('RTX 4090');

      // Pricing resolved from ZONE rule (3500 bani = 35 RON)
      expect(inspector.pricing.hourly_rate_minor).toBe(3500);
      expect(inspector.pricing.source).toBe('ZONE');

      // Policy resolved from zone profile
      expect(inspector.policy.cancellation_cutoff_hours).toBe(4);
      expect(inspector.policy.deposit_percentage).toBe(50);
    });

    it('updates resource inspector metadata (name, specs, bookability) and emits audit log', async () => {
      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.manager.cookie, 'x-request-id': 'req-inspect-upd-1' },
          body: {
            name: 'PRO-STAGE-ALPHA',
            bookable: true,
            attributes: { gpu: 'RTX 4090 OC', refresh_rate: '360Hz', monitor: 'ZOWIE XL2566K' },
          },
        },
      );

      expect(res.status).toBe(200);
      const updated = (res.json as any).inspector;
      expect(updated.name).toBe('PRO-STAGE-ALPHA');
      expect(updated.attributes.refresh_rate).toBe('360Hz');

      // Check DB audit event
      const auditRes = await app.db.query<{ action: string; target_type: string }>(
        "SELECT action, target_type FROM audit_events WHERE venue_id = $1 AND action = 'RESOURCE_INSPECTOR_UPDATED' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].target_type).toBe('RESOURCE');
    });

    it('rejects name update on collision with another resource in the same venue (409 RESOURCE_NAME_EXISTS)', async () => {
      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            name: 'PRO-STATION-02', // already taken by pc2Id
          },
        },
      );

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('RESOURCE_NAME_EXISTS');
    });
  });

  // ===========================================================================
  // 2. Adjacency Edges (Smart Seat Graph)
  // ===========================================================================
  describe('Adjacency Edges (Smart Seat Graph)', () => {
    let edgeId: string;

    it('creates an adjacency edge between two stations with distance metric', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            resource_a_id: pc1Id,
            resource_b_id: pc2Id,
            distance_metric: 1,
          },
        },
      );

      expect(res.status).toBe(201);
      const adj = (res.json as any).adjacency;
      expect(adj.distance_metric).toBe(1);
      expect(adj.resource_a_name).toBeDefined();
      expect(adj.resource_b_name).toBeDefined();
      edgeId = adj.id;

      // Verify inspector reflects neighbor
      const inspRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const neighbors = (inspRes.json as any).inspector.adjacencies;
      expect(neighbors.length).toBe(1);
      expect(neighbors[0].neighbor_resource_id).toBe(pc2Id);
    });

    it('normalizes pair and updates distance metric on conflict without duplicating edge', async () => {
      // Send reversed IDs: pc2Id, pc1Id
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            resource_a_id: pc2Id,
            resource_b_id: pc1Id,
            distance_metric: 2,
          },
        },
      );

      expect(res.status).toBe(201);
      const adj = (res.json as any).adjacency;
      expect(adj.distance_metric).toBe(2);

      // Verify DB table has exactly 1 edge between them
      const countRes = await app.db.query(
        'SELECT count(*) FROM resource_adjacencies WHERE venue_id = $1',
        [fixtures.venueId],
      );
      expect(Number(countRes.rows[0].count)).toBe(1);
    });

    it('rejects self-adjacency with 400 SELF_ADJACENCY_PROHIBITED', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            resource_a_id: pc1Id,
            resource_b_id: pc1Id,
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('SELF_ADJACENCY_PROHIBITED');
    });

    it('rejects adjacency with cross-tenant or non-existent resource with 404 RESOURCE_NOT_FOUND', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            resource_a_id: pc1Id,
            resource_b_id: '00000000-0000-0000-0000-000000000099',
          },
        },
      );

      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('lists all adjacencies in the venue', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const edges = (res.json as any).adjacencies;
      expect(edges.length).toBe(1);
      expect(edges[0].id).toBe(edgeId);
    });

    it('suggests candidate adjacencies based on layout draft Euclidean proximity', async () => {
      // Seed layout draft with geometric coordinates
      await app.db.query(
        `INSERT INTO layout_drafts (
          venue_id, revision, schema_version, canvas, rooms, layers, nodes
        ) VALUES (
          $1, 1, 1,
          '{"width": 1600, "height": 1000, "grid": 20}'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          $2::jsonb
        ) ON CONFLICT (venue_id) DO UPDATE SET nodes = EXCLUDED.nodes`,
        [
          fixtures.venueId,
          JSON.stringify([
            {
              id: 'node-pc-1',
              kind: 'RESOURCE',
              layer_id: 'equipment',
              room_id: mainRoomId,
              resource_id: pc1Id,
              label: 'STATION-01',
              x: 100,
              y: 100,
              w: 60,
              h: 40,
            },
            {
              id: 'node-pc-2',
              kind: 'RESOURCE',
              layer_id: 'equipment',
              room_id: mainRoomId,
              resource_id: pc2Id,
              label: 'STATION-02',
              x: 170, // 70px apart
              y: 100,
              w: 60,
              h: 40,
            },
            {
              id: 'node-pc-3',
              kind: 'RESOURCE',
              layer_id: 'equipment',
              room_id: mainRoomId,
              resource_id: pc3Id,
              label: 'STATION-03',
              x: 240, // 70px apart from pc2
              y: 100,
              w: 60,
              h: 40,
            },
          ]),
        ],
      );

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies/suggest?max_proximity=160`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const suggestions = (res.json as any).suggestions;
      expect(suggestions.length).toBeGreaterThanOrEqual(2);

      // pc1 & pc2 are 70px apart (already adjacent = true)
      const p1p2 = suggestions.find(
        (s: any) =>
          (s.resource_a_id === pc1Id && s.resource_b_id === pc2Id) ||
          (s.resource_a_id === pc2Id && s.resource_b_id === pc1Id),
      );
      expect(p1p2).toBeDefined();
      expect(p1p2.already_adjacent).toBe(true);
      expect(p1p2.euclidean_distance).toBeLessThanOrEqual(80);

      // pc2 & pc3 are 70px apart (already adjacent = false)
      const p2p3 = suggestions.find(
        (s: any) =>
          (s.resource_a_id === pc2Id && s.resource_b_id === pc3Id) ||
          (s.resource_a_id === pc3Id && s.resource_b_id === pc2Id),
      );
      expect(p2p3).toBeDefined();
      expect(p2p3.already_adjacent).toBe(false);
      expect(p2p3.suggested_distance_metric).toBe(1);
    });

    it('deletes an adjacency edge and updates inspector view', async () => {
      const res = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${fixtures.venueId}/adjacencies/${edgeId}`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      expect((res.json as any).deleted).toBe(true);

      const inspRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((inspRes.json as any).inspector.adjacencies.length).toBe(0);
    });
  });

  // ===========================================================================
  // 3. Private Room Composition Editing
  // ===========================================================================
  describe('Private Room Composition Editing', () => {
    it('retrieves empty private room composition initially', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${privateRoomResourceId}/composition`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const comp = (res.json as any).composition;
      expect(comp.room_resource_id).toBe(privateRoomResourceId);
      expect(comp.total_components).toBe(0);
      expect(comp.components.length).toBe(0);
    });

    it('updates private room composition with child PC stations and emits outbox/audit', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${privateRoomResourceId}/composition`,
        {
          headers: { cookie: fixtures.manager.cookie, 'x-request-id': 'req-comp-upd-1' },
          body: {
            child_resource_ids: [pc1Id, pc2Id],
          },
        },
      );

      expect(res.status).toBe(200);
      const comp = (res.json as any).composition;
      expect(comp.total_components).toBe(2);
      expect(comp.components.some((c: any) => c.id === pc1Id)).toBe(true);
      expect(comp.components.some((c: any) => c.id === pc2Id)).toBe(true);

      // Verify inspector on pc1Id now reflects parent private room
      const inspRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );
      const parentRooms = (inspRes.json as any).inspector.components.parent_resources;
      expect(parentRooms.length).toBe(1);
      expect(parentRooms[0].id).toBe(privateRoomResourceId);

      // Check DB audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE venue_id = $1 AND action = 'PRIVATE_ROOM_COMPOSITION_UPDATED' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('rejects self-containment with 400 SELF_CONTAINMENT_PROHIBITED', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${privateRoomResourceId}/composition`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            child_resource_ids: [privateRoomResourceId],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('SELF_CONTAINMENT_PROHIBITED');
    });

    it('rejects composition editing on non-private-room resource with 400 INVALID_RESOURCE_TYPE', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${pc1Id}/composition`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            child_resource_ids: [pc2Id],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_RESOURCE_TYPE');
    });

    it('rejects circular DAG composition between private rooms with 400 DAG_CYCLE_DETECTED', async () => {
      // 1. Assign secondPrivateRoomId into privateRoomResourceId
      await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${privateRoomResourceId}/composition`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            child_resource_ids: [secondPrivateRoomId],
          },
        },
      );

      // 2. Now attempt to assign privateRoomResourceId as child of secondPrivateRoomId
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${secondPrivateRoomId}/composition`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            child_resource_ids: [privateRoomResourceId],
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('DAG_CYCLE_DETECTED');
    });
  });

  // ===========================================================================
  // 4. RBAC & Cross-Tenant Boundary
  // ===========================================================================
  describe('RBAC & Cross-Tenant Permissions', () => {
    it('prevents RECEPTION staff from mutating inspector or composition (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const inspectRes = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { name: 'UNAUTHORIZED_RENAME' },
        },
      );
      expect(inspectRes.status).toBe(403);
      expect(app.errorOf(inspectRes).code).toBe('AUTH_ROLE_NOT_PERMITTED');

      const compRes = await app.call(
        'PUT',
        `/v1/dashboard/venues/${fixtures.venueId}/private-rooms/${privateRoomResourceId}/composition`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { child_resource_ids: [] },
        },
      );
      expect(compRes.status).toBe(403);
      expect(app.errorOf(compRes).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('enforces cross-tenant isolation returning 404 RESOURCE_NOT_FOUND on foreign venue access', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${foreignFixtures.venueId}/resources/${pc1Id}/inspector`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
