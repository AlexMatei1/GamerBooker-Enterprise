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

describe('ENG-202 Resource CRUD and Bulk Clone/Import', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenue: { owner: Fixture; venueId: string };
  let roomId: string;
  let zoneId: string;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng202');
      fixtures = await createVenueWithRoles(app, 'Nexus Gaming SRL', 'Nexus Hub Bucharest');
      const other = await createVenueWithRoles(app, 'Rival Gaming SRL', 'Rival Lounge Cluj');
      otherVenue = { owner: other.owner, venueId: other.venueId };

      // Room and Zone
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [fixtures.venueId, 'Main Floor'],
      );
      roomId = roomRes.rows[0].id;

      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, $3) RETURNING id',
        [fixtures.venueId, roomId, 'Pro Zone'],
      );
      zoneId = zoneRes.rows[0].id;
    } catch (err) {
      console.error('beforeAll failed:', err);
      throw err;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('Single Resource Lifecycle & Active Booking Guard', () => {
    let testResourceId: string;

    it('creates a new single resource', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/resources`, {
        headers: { cookie: fixtures.owner.cookie },
        body: {
          name: 'ALPHA-01',
          type: 'PC',
          roomId,
          zoneId,
          attributes: { gpu: 'RTX 4070', cpu: 'i7-13700' },
          bookable: true,
          status: 'AVAILABLE',
        },
      });

      expect(res.status).toBe(201);
      const resource = (res.json as any).resource;
      expect(resource.name).toBe('ALPHA-01');
      expect(resource.status).toBe('AVAILABLE');
      expect(resource.bookable).toBe(true);
      testResourceId = resource.id;
    });

    it('reads resource detail via GET /resources/:id', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.reception.cookie }, // Reception has read access
        },
      );

      expect(res.status).toBe(200);
      const resource = (res.json as any).resource;
      expect(resource.id).toBe(testResourceId);
      expect(resource.name).toBe('ALPHA-01');
      expect(resource.attributes.gpu).toBe('RTX 4070');
    });

    it('updates resource attributes and status via PATCH', async () => {
      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.manager.cookie }, // Manager has update permission
          body: {
            name: 'ALPHA-01-UPGRADED',
            attributes: { gpu: 'RTX 4080 Super', ram: '64GB' },
            status: 'MAINTENANCE',
            bookable: false,
          },
        },
      );

      expect(res.status).toBe(200);
      const resource = (res.json as any).resource;
      expect(resource.name).toBe('ALPHA-01-UPGRADED');
      expect(resource.status).toBe('MAINTENANCE');
      expect(resource.bookable).toBe(false);
      expect(resource.attributes.ram).toBe('64GB');

      // Re-enable for subsequent claim tests
      await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: { status: 'AVAILABLE', bookable: true },
        },
      );
    });

    it('blocks deletion of a resource with active future booking (409 RESOURCE_HAS_ACTIVE_BOOKINGS)', async () => {
      // Simulate an active claim in the future
      const futureStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

      await app.db.query(
        `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, slot, state)
         VALUES ($1, $2, $3, 'BOOKING', tstzrange($4::timestamptz, $5::timestamptz, '[)'), 'CONFIRMED')`,
        [testResourceId, fixtures.tenantId, fixtures.owner.userId, futureStart, futureEnd],
      );

      const deleteRes = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(deleteRes.status).toBe(409);
      const err = app.errorOf(deleteRes);
      expect(err.code).toBe('RESOURCE_HAS_ACTIVE_BOOKINGS');
    });

    it('successfully deletes resource once claims are released/cancelled', async () => {
      // Cancel the active claim
      await app.db.query(
        "UPDATE resource_claims SET state = 'CANCELLED' WHERE resource_id = $1",
        [testResourceId],
      );

      const deleteRes = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(deleteRes.status).toBe(200);
      expect((deleteRes.json as any).deleted).toBe(true);

      // Verify resource no longer exists
      const getRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${testResourceId}`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );
      expect(getRes.status).toBe(404);
    });
  });

  describe('Bulk Clone Resources', () => {
    it('clones 10 PCs with sequential names PC-01 through PC-10 and template attributes', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-clone`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            template: {
              type: 'PC',
              roomId,
              zoneId,
              attributes: { gpu: 'RTX 4080', monitor: '240Hz' },
              bookable: true,
              status: 'AVAILABLE',
            },
            naming: {
              prefix: 'PC-',
              startIndex: 1,
              count: 10,
              padLength: 2,
            },
          },
        },
      );

      expect(res.status).toBe(201);
      const resources = (res.json as any).resources as Array<{ name: string; type: string }>;
      expect(resources).toHaveLength(10);
      expect(resources[0].name).toBe('PC-01');
      expect(resources[9].name).toBe('PC-10');

      // Verify in DB
      const dbRows = await app.db.query(
        "SELECT count(*) FROM resources WHERE venue_id = $1 AND name LIKE 'PC-%'",
        [fixtures.venueId],
      );
      expect(parseInt(dbRows.rows[0].count, 10)).toBe(10);
    });

    it('rejects bulk clone when generated names collide with existing resources (409 RESOURCE_NAME_EXISTS)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-clone`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            template: {
              type: 'PC',
              roomId,
              zoneId,
              attributes: {},
              bookable: true,
              status: 'AVAILABLE',
            },
            naming: {
              prefix: 'PC-',
              startIndex: 5, // PC-05 already exists
              count: 5,
              padLength: 2,
            },
          },
        },
      );

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('RESOURCE_NAME_EXISTS');
    });

    it('rejects bulk clone with count exceeding 100 (400 BATCH_SIZE_EXCEEDED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-clone`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            template: { type: 'PC', roomId, zoneId },
            naming: { prefix: 'BIG-', startIndex: 1, count: 101 },
          },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('BATCH_SIZE_EXCEEDED');
    });
  });

  describe('Bulk Update Resources', () => {
    it('updates status and bookable across multiple resources atomically', async () => {
      // Fetch 5 of the cloned PCs
      const listRes = await app.db.query<{ id: string }>(
        "SELECT id FROM resources WHERE venue_id = $1 AND name IN ('PC-01', 'PC-02', 'PC-03') ORDER BY id",
        [fixtures.venueId],
      );
      const targetIds = listRes.rows.map((r) => r.id);

      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-update`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            resource_ids: targetIds,
            updates: {
              status: 'MAINTENANCE',
              bookable: false,
              attributes: { maintenance_reason: 'Routine driver update' },
            },
          },
        },
      );

      expect(res.status).toBe(200);
      expect((res.json as any).updated_count).toBe(3);

      // Verify in DB
      const checkRes = await app.db.query<{ status: string; bookable: boolean }>(
        'SELECT status, bookable FROM resources WHERE id = ANY($1)',
        [targetIds],
      );
      expect(checkRes.rows.every((r) => r.status === 'MAINTENANCE' && !r.bookable)).toBe(true);
    });

    it('rejects bulk update with 404 RESOURCE_NOT_FOUND if any ID belongs to another venue', async () => {
      // Create a resource in other venue
      const otherRes = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, type, name, status, bookable) VALUES ($1, 'PC', 'OTHER-01', 'AVAILABLE', true) RETURNING id",
        [otherVenue.venueId],
      );
      const otherId = otherRes.rows[0].id;

      // Local resource
      const localRes = await app.db.query<{ id: string }>(
        "SELECT id FROM resources WHERE venue_id = $1 LIMIT 1",
        [fixtures.venueId],
      );
      const localId = localRes.rows[0].id;

      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-update`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            resource_ids: [localId, otherId],
            updates: { status: 'AVAILABLE' },
          },
        },
      );

      expect(res.status).toBe(404);
      const err = app.errorOf(res);
      expect(err.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('Bulk Import & RBAC Scoping', () => {
    it('bulk imports heterogeneous equipment catalog items in a single transaction', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-import`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            items: [
              {
                name: 'SIMULATOR-01',
                type: 'PC',
                roomId,
                zoneId,
                attributes: { wheel: 'Fanatec', vr: 'Valve Index' },
                bookable: true,
                status: 'AVAILABLE',
              },
              {
                name: 'CONSOLE-PS5-01',
                type: 'CONSOLE_SETUP',
                roomId,
                zoneId,
                attributes: { console: 'PlayStation 5', controllers: 4 },
                bookable: true,
                status: 'AVAILABLE',
              },
            ],
          },
        },
      );

      expect(res.status).toBe(201);
      const resources = (res.json as any).resources;
      expect(resources).toHaveLength(2);
      expect(resources[0].name).toBe('SIMULATOR-01');
      expect(resources[1].name).toBe('CONSOLE-PS5-01');
    });

    it('prevents RECEPTION staff from mutating resources (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/bulk-clone`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            template: { type: 'PC' },
            naming: { prefix: 'FORBIDDEN-', startIndex: 1, count: 2 },
          },
        },
      );

      expect(res.status).toBe(403);
      const err = app.errorOf(res);
      expect(err.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });
});
