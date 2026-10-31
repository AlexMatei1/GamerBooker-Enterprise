/**
 * Acceptance test suite for ENG-003: Multi-tenant venue schema, memberships,
 * admin onboarding, and T-018 row ownership tests.
 */
import { startTestApp, type TestApp } from './support/auth-harness';

interface Fixture {
  userId: string;
  cookie: string;
  email: string;
  tenantId: string;
  venueId: string;
}

async function createTenantAndVenue(
  app: TestApp,
  tenantName: string,
  venueName: string,
  role: string = 'OWNER',
): Promise<Fixture> {
  const user = await app.verifiedUser();
  const tenant = await app.db.query<{ id: string }>(
    'INSERT INTO tenants (legal_name) VALUES ($1) RETURNING id',
    [tenantName],
  );
  const tenantId = tenant.rows[0].id;
  const venue = await app.db.query<{ id: string }>(
    "INSERT INTO venues (tenant_id, name, timezone, publication_state) VALUES ($1, $2, 'Europe/Bucharest', 'DRAFT') RETURNING id",
    [tenantId, venueName],
  );
  const venueId = venue.rows[0].id;
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [user.userId, venueId, tenantId, role],
  );
  if (['OWNER', 'VENUE_MANAGER', 'PLATFORM_ADMIN'].includes(role)) {
    await app.db.query(
      'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
        " VALUES ($1, 'totp', pgp_sym_encrypt('JBSWY3DPEHPK3PXP', 'test-mfa-key-0123456789abcdef0123456789'), now())" +
        ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
      [user.userId],
    );
  }
  return { ...user, tenantId, venueId };
}

describe('ENG-003 Multi-Tenant Venues & Row Ownership (T-018)', () => {
  let app: TestApp;
  let tenantA: Fixture;
  let tenantB: Fixture;

  beforeAll(async () => {
    app = await startTestApp('eng003');
    tenantA = await createTenantAndVenue(app, 'CyberArena SRL', 'CyberArena Bucharest', 'OWNER');
    tenantB = await createTenantAndVenue(app, 'PixelHub SRL', 'PixelHub Cluj', 'OWNER');
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  }, 60000);

  describe('T-018 Cross-Tenant Boundaries & Row Ownership', () => {
    it('answers 404 RESOURCE_NOT_FOUND when Tenant A staff tries to read Tenant B dashboard venue', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${tenantB.venueId}`, {
        headers: { cookie: tenantA.cookie },
      });
      expect(res.status).toBe(404);
      expect((res.json as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('answers 404 RESOURCE_NOT_FOUND when Tenant A staff tries to patch Tenant B venue profile', async () => {
      const res = await app.call('PATCH', `/v1/dashboard/venues/${tenantB.venueId}`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'Hacked Name' },
      });
      expect(res.status).toBe(404);
      expect((res.json as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('answers 404 RESOURCE_NOT_FOUND when Tenant A staff tries to list or create rooms in Tenant B venue', async () => {
      const listRes = await app.call('GET', `/v1/dashboard/venues/${tenantB.venueId}/rooms`, {
        headers: { cookie: tenantA.cookie },
      });
      expect(listRes.status).toBe(404);

      const createRes = await app.call('POST', `/v1/dashboard/venues/${tenantB.venueId}/rooms`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'Unauthorized Room' },
      });
      expect(createRes.status).toBe(404);
    });

    it('answers 404 RESOURCE_NOT_FOUND when Tenant A staff tries to read or create resources in Tenant B venue', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${tenantB.venueId}/resources`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'Alien PC', type: 'PC' },
      });
      expect(res.status).toBe(404);
    });

    it('answers 404 RESOURCE_NOT_FOUND when Tenant A staff tries to inspect Tenant B staff memberships', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${tenantB.venueId}/memberships`, {
        headers: { cookie: tenantA.cookie },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Rooms, Zones & Resource Hierarchy', () => {
    let roomId: string;
    let zoneId: string;
    let pc1Id: string;
    let pc2Id: string;
    let vipRoomId: string;

    it('creates rooms within venue A', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/rooms`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'Main Hall', geometry_metadata: { width: 100, height: 80 } },
      });
      expect(res.status).toBe(201);
      const room = (res.json as { room: { id: string; name: string } }).room;
      expect(room.name).toBe('Main Hall');
      roomId = room.id;
    });

    it('creates zones inside the room', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/zones`, {
        headers: { cookie: tenantA.cookie },
        body: { roomId, name: 'VIP Area' },
      });
      expect(res.status).toBe(201);
      const zone = (res.json as { zone: { id: string; name: string } }).zone;
      expect(zone.name).toBe('VIP Area');
      zoneId = zone.id;
    });

    it('rejects creating a zone referencing a room from another venue', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${tenantB.venueId}/zones`, {
        headers: { cookie: tenantB.cookie },
        body: { roomId, name: 'Cross Venue Zone' }, // roomId belongs to Venue A!
      });
      expect(res.status).toBe(400);
      expect((res.json as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    });

    it('creates PC and PRIVATE_ROOM resources', async () => {
      const pc1 = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'PC-01', type: 'PC', roomId, zoneId },
      });
      expect(pc1.status).toBe(201);
      pc1Id = (pc1.json as { resource: { id: string } }).resource.id;

      const pc2 = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'PC-02', type: 'PC', roomId, zoneId },
      });
      expect(pc2.status).toBe(201);
      pc2Id = (pc2.json as { resource: { id: string } }).resource.id;

      const vip = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: tenantA.cookie },
        body: { name: 'VIP Room Alpha', type: 'PRIVATE_ROOM', roomId },
      });
      expect(vip.status).toBe(201);
      vipRoomId = (vip.json as { resource: { id: string } }).resource.id;
    });

    it('links child resources to a private room component graph', async () => {
      const res1 = await app.call(
        'POST',
        `/v1/dashboard/venues/${tenantA.venueId}/resources/${vipRoomId}/components`,
        {
          headers: { cookie: tenantA.cookie },
          body: { child_resource_id: pc1Id },
        },
      );
      expect(res1.status).toBe(201);

      const res2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${tenantA.venueId}/resources/${vipRoomId}/components`,
        {
          headers: { cookie: tenantA.cookie },
          body: { child_resource_id: pc2Id },
        },
      );
      expect(res2.status).toBe(201);
    });

    it('rejects self-containment for resources', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${tenantA.venueId}/resources/${vipRoomId}/components`,
        {
          headers: { cookie: tenantA.cookie },
          body: { child_resource_id: vipRoomId },
        },
      );
      expect(res.status).toBe(400);
    });

    it('rejects adding components where parent is not a PRIVATE_ROOM', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${tenantA.venueId}/resources/${pc1Id}/components`,
        {
          headers: { cookie: tenantA.cookie },
          body: { child_resource_id: pc2Id },
        },
      );
      expect(res.status).toBe(400);
      expect((res.json as { error: { message: string } }).error.message).toContain('PRIVATE_ROOM');
    });
  });

  describe('RBAC Roles within Venue Management', () => {
    let receptionUser: Fixture;
    let barUser: Fixture;

    beforeAll(async () => {
      // Create reception and bar staff in Venue A
      const rec = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [rec.userId, tenantA.venueId, tenantA.tenantId, 'RECEPTION'],
      );
      receptionUser = { ...rec, tenantId: tenantA.tenantId, venueId: tenantA.venueId };

      const bar = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [bar.userId, tenantA.venueId, tenantA.tenantId, 'BAR_STAFF'],
      );
      barUser = { ...bar, tenantId: tenantA.tenantId, venueId: tenantA.venueId };
    });

    it('lets RECEPTION view rooms and resources', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: receptionUser.cookie },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray((res.json as { resources: unknown[] }).resources)).toBe(true);
    });

    it('denies RECEPTION from creating resources (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: receptionUser.cookie },
        body: { name: 'Illegal Console', type: 'CONSOLE_SETUP' },
      });
      expect(res.status).toBe(403);
      expect((res.json as { error: { code: string } }).error.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('denies BAR_STAFF from accessing venue catalog settings (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: barUser.cookie },
      });
      expect(res.status).toBe(403);
      expect((res.json as { error: { code: string } }).error.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('lets OWNER manage staff memberships and deactivation immediately revokes access', async () => {
      const newStaff = await app.verifiedUser();

      // Owner onboards new staff as RECEPTION
      const addRes = await app.call('POST', `/v1/dashboard/venues/${tenantA.venueId}/memberships`, {
        headers: { cookie: tenantA.cookie },
        body: { userId: newStaff.userId, role: 'RECEPTION' },
      });
      expect(addRes.status).toBe(201);
      const membershipId = (addRes.json as { membership: { id: string } }).membership.id;

      // New staff can access resources
      const accessRes = await app.call('GET', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: newStaff.cookie },
      });
      expect(accessRes.status).toBe(200);

      // Owner deactivates staff membership
      const patchRes = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${tenantA.venueId}/memberships/${membershipId}`,
        {
          headers: { cookie: tenantA.cookie },
          body: { active: false },
        },
      );
      expect(patchRes.status).toBe(200);

      // Deactivated staff immediately receives 404
      const deniedRes = await app.call('GET', `/v1/dashboard/venues/${tenantA.venueId}/resources`, {
        headers: { cookie: newStaff.cookie },
      });
      expect(deniedRes.status).toBe(404);
    });
  });

  describe('Public Venue Discovery Scoping', () => {
    it('excludes DRAFT venues from the public /v1/venues listing', async () => {
      const res = await app.call('GET', '/v1/venues');
      expect(res.status).toBe(200);
      const venues = (res.json as { venues: Array<{ id: string }> }).venues;
      const foundA = venues.find((v) => v.id === tenantA.venueId);
      expect(foundA).toBeUndefined();
    });

    it('includes venue in public listing once PUBLISHED', async () => {
      // Owner publishes the venue
      const pubRes = await app.call('PATCH', `/v1/dashboard/venues/${tenantA.venueId}`, {
        headers: { cookie: tenantA.cookie },
        body: { publication_state: 'PUBLISHED' },
      });
      expect(pubRes.status).toBe(200);

      const res = await app.call('GET', '/v1/venues');
      expect(res.status).toBe(200);
      const venues = (res.json as { venues: Array<{ id: string; name: string }> }).venues;
      const foundA = venues.find((v) => v.id === tenantA.venueId);
      expect(foundA).toBeDefined();
      expect(foundA?.name).toBe('CyberArena Bucharest');
    });
  });
});
