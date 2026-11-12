/**
 * Acceptance test suite for ENG-101: Resource types, schedule, and exception calendar.
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
    "INSERT INTO venues (tenant_id, name, timezone, publication_state) VALUES ($1, $2, 'Europe/Bucharest', 'PUBLISHED') RETURNING id",
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
    user.cookie = await app.elevateMfa(user.cookie);
  }

  return { ...user, tenantId, venueId };
}

describe('ENG-101 Schedules, Exception Calendar, and Availability Engine', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;

  beforeAll(async () => {
    app = await startTestApp('eng101', { browserClient: true });
    ownerFixture = await createTenantAndVenue(app, 'Alpha Esports SRL', 'Arena Central', 'OWNER');
    foreignFixture = await createTenantAndVenue(app, 'Beta Gaming SRL', 'Beta Lounge', 'OWNER');
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Weekly Operating Schedule CRUD & RBAC', () => {
    it('allows OWNER to set and retrieve weekly operating hours', async () => {
      const schedulePayload = [
        { dayOfWeek: 1, openTime: '10:00', closeTime: '22:00', isClosed: false }, // Mon
        { dayOfWeek: 2, openTime: '10:00', closeTime: '22:00', isClosed: false }, // Tue
        { dayOfWeek: 3, openTime: '10:00', closeTime: '22:00', isClosed: false }, // Wed
        { dayOfWeek: 4, openTime: '10:00', closeTime: '22:00', isClosed: false }, // Thu
        { dayOfWeek: 5, openTime: '10:00', closeTime: '02:00', isClosed: false }, // Fri (cross-midnight)
        { dayOfWeek: 6, openTime: '12:00', closeTime: '02:00', isClosed: false }, // Sat
        { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', isClosed: true },  // Sun (closed)
      ];

      const putRes = await app.call(
        'PUT',
        `/v1/dashboard/venues/${ownerFixture.venueId}/schedule`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { schedules: schedulePayload },
        },
      );

      expect(putRes.status).toBe(200);
      const putData = putRes.json as { schedules: Array<{ day_of_week: number; open_time: string }> };
      expect(putData.schedules.length).toBe(7);

      const getRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/schedule`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(getRes.status).toBe(200);
      const getData = getRes.json as { schedules: Array<{ day_of_week: number; is_closed: boolean }> };
      const sunday = getData.schedules.find((s) => s.day_of_week === 0);
      expect(sunday?.is_closed).toBe(true);
    });

    it('denies cross-tenant schedule modification with 404 (T-018 row ownership)', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${foreignFixture.venueId}/schedule`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            schedules: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' }],
          },
        },
      );

      expect(res.status).toBe(404);
      const error = app.errorOf(res);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('denies RECEPTION staff from modifying operating schedule (403)', async () => {
      const recUser = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [recUser.userId, ownerFixture.venueId, ownerFixture.tenantId, 'RECEPTION'],
      );

      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${ownerFixture.venueId}/schedule`,
        {
          headers: { cookie: recUser.cookie },
          body: {
            schedules: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' }],
          },
        },
      );

      expect(res.status).toBe(403);
      const error = app.errorOf(res);
      expect(error.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });

  describe('Exception Calendar Management', () => {
    let createdExceptionId: string;

    it('allows OWNER to add holiday exception closures', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/exceptions`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            date: '2026-12-25',
            isClosed: true,
            reason: 'Christmas Day Closure',
          },
        },
      );

      expect(res.status).toBe(201);
      const data = res.json as { exception: { id: string; date: string; is_closed: boolean } };
      expect(data.exception.id).toBeDefined();
      expect(data.exception.is_closed).toBe(true);
      createdExceptionId = data.exception.id;
    });

    it('lists exceptions for the venue', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/exceptions`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as { exceptions: Array<{ date: string; reason: string }> };
      expect(data.exceptions.some((e) => e.reason === 'Christmas Day Closure')).toBe(true);
    });

    it('allows OWNER to delete an exception', async () => {
      const res = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${ownerFixture.venueId}/exceptions/${createdExceptionId}`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(200);

      // Verify deleted
      const checkRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/exceptions`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );
      const checkData = checkRes.json as { exceptions: Array<{ id: string }> };
      expect(checkData.exceptions.some((e) => e.id === createdExceptionId)).toBe(false);
    });
  });

  describe('Public Availability Engine & DAG Collision Rules', () => {
    let pc1Id: string;
    let pc2Id: string;
    let vipRoomId: string;

    beforeAll(async () => {
      // 1. Setup weekly schedule for Venue A: Monday open 10:00 to 20:00 UTC
      await app.call(
        'PUT',
        `/v1/dashboard/venues/${ownerFixture.venueId}/schedule`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            schedules: [
              { dayOfWeek: 1, openTime: '10:00', closeTime: '20:00', isClosed: false }, // Mon 10-20
            ],
          },
        },
      );

      // 2. Setup Resources: PC1, PC2, VIP Suite (contains PC1 and PC2)
      const pc1 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, name, type, bookable, status) VALUES ($1, 'Alpha PC #1', 'PC', true, 'AVAILABLE') RETURNING id",
        [ownerFixture.venueId],
      );
      pc1Id = pc1.rows[0].id;

      const pc2 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, name, type, bookable, status) VALUES ($1, 'Alpha PC #2', 'PC', true, 'AVAILABLE') RETURNING id",
        [ownerFixture.venueId],
      );
      pc2Id = pc2.rows[0].id;

      const vip = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, name, type, bookable, status) VALUES ($1, 'VIP Suite Alpha', 'PRIVATE_ROOM', true, 'AVAILABLE') RETURNING id",
        [ownerFixture.venueId],
      );
      vipRoomId = vip.rows[0].id;

      // Link VIP Suite -> PC1, PC2
      await app.db.query(
        'INSERT INTO resource_components (parent_resource_id, child_resource_id, venue_id) VALUES ($1, $2, $3), ($1, $4, $3)',
        [vipRoomId, pc1Id, ownerFixture.venueId, pc2Id],
      );
    });

    it('returns full operating window when no bookings exist', async () => {
      // 2026-11-02 is a Monday
      const from = '2026-11-02T08:00:00Z';
      const to = '2026-11-02T22:00:00Z';

      const res = await app.call('GET', `/v1/venues/${ownerFixture.venueId}/availability?from=${from}&to=${to}`);
      expect(res.status).toBe(200);

      const data = res.json as {
        resources: Array<{ resourceId: string; availableWindows: Array<{ start: string; end: string }> }>;
      };

      const pc1Avail = data.resources.find((r) => r.resourceId === pc1Id);
      expect(pc1Avail?.availableWindows.length).toBe(1);
      // Clamped to 10:00 - 20:00 UTC operating hours
      expect(pc1Avail?.availableWindows[0].start).toBe('2026-11-02T10:00:00.000Z');
      expect(pc1Avail?.availableWindows[0].end).toBe('2026-11-02T20:00:00.000Z');
    });

    it('subtracts an active claim interval on PC #1', async () => {
      // Claim PC1 from 14:00 to 16:00
      await app.db.query(
        `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
         VALUES ($1, $2, $3, 'HOLD', 'ACTIVE_HOLD', tstzrange('2026-11-02T14:00:00Z', '2026-11-02T16:00:00Z', '[)'))`,
        [pc1Id, ownerFixture.tenantId, ownerFixture.userId],
      );

      const from = '2026-11-02T08:00:00Z';
      const to = '2026-11-02T22:00:00Z';

      const res = await app.call('GET', `/v1/venues/${ownerFixture.venueId}/availability?from=${from}&to=${to}`);
      expect(res.status).toBe(200);

      const data = res.json as {
        resources: Array<{ resourceId: string; availableWindows: Array<{ start: string; end: string }> }>;
      };

      const pc1Avail = data.resources.find((r) => r.resourceId === pc1Id);
      // PC1 window is split into [10:00, 14:00) and [16:00, 20:00)
      expect(pc1Avail?.availableWindows.length).toBe(2);
      expect(pc1Avail?.availableWindows[0].start).toBe('2026-11-02T10:00:00.000Z');
      expect(pc1Avail?.availableWindows[0].end).toBe('2026-11-02T14:00:00.000Z');
      expect(pc1Avail?.availableWindows[1].start).toBe('2026-11-02T16:00:00.000Z');
      expect(pc1Avail?.availableWindows[1].end).toBe('2026-11-02T20:00:00.000Z');

      // DAG INVARIANT: VIP Suite contains PC1, so VIP Suite must ALSO be blocked 14:00-16:00!
      const vipAvail = data.resources.find((r) => r.resourceId === vipRoomId);
      expect(vipAvail?.availableWindows.length).toBe(2);
      expect(vipAvail?.availableWindows[0].end).toBe('2026-11-02T14:00:00.000Z');
      expect(vipAvail?.availableWindows[1].start).toBe('2026-11-02T16:00:00.000Z');

      // PC2 has NO claim, so PC2 is still available 10:00-20:00
      const pc2Avail = data.resources.find((r) => r.resourceId === pc2Id);
      expect(pc2Avail?.availableWindows.length).toBe(1);
      expect(pc2Avail?.availableWindows[0].start).toBe('2026-11-02T10:00:00.000Z');
      expect(pc2Avail?.availableWindows[0].end).toBe('2026-11-02T20:00:00.000Z');
    });

    it('blocks all child PCs when the parent VIP Suite is claimed', async () => {
      // Claim VIP Suite from 18:00 to 20:00
      await app.db.query(
        `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
         VALUES ($1, $2, $3, 'BOOKING', 'CONFIRMED', tstzrange('2026-11-02T18:00:00Z', '2026-11-02T20:00:00Z', '[)'))`,
        [vipRoomId, ownerFixture.tenantId, ownerFixture.userId],
      );

      const from = '2026-11-02T08:00:00Z';
      const to = '2026-11-02T22:00:00Z';

      const res = await app.call('GET', `/v1/venues/${ownerFixture.venueId}/availability?from=${from}&to=${to}`);
      expect(res.status).toBe(200);

      const data = res.json as {
        resources: Array<{ resourceId: string; availableWindows: Array<{ start: string; end: string }> }>;
      };

      // PC2 was free, but now VIP Suite is booked 18:00-20:00, so PC2 is blocked 18:00-20:00!
      const pc2Avail = data.resources.find((r) => r.resourceId === pc2Id);
      expect(pc2Avail?.availableWindows.length).toBe(1);
      expect(pc2Avail?.availableWindows[0].start).toBe('2026-11-02T10:00:00.000Z');
      expect(pc2Avail?.availableWindows[0].end).toBe('2026-11-02T18:00:00.000Z');
    });

    it('returns zero available windows on a holiday closure exception date', async () => {
      // Add holiday closure on Monday 2026-11-09
      await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/exceptions`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            date: '2026-11-09',
            isClosed: true,
            reason: 'Emergency Maintenance Closure',
          },
        },
      );

      const from = '2026-11-09T08:00:00Z';
      const to = '2026-11-09T22:00:00Z';

      const res = await app.call('GET', `/v1/venues/${ownerFixture.venueId}/availability?from=${from}&to=${to}`);
      expect(res.status).toBe(200);

      const data = res.json as {
        resources: Array<{ resourceId: string; availableWindows: Array<{ start: string; end: string }> }>;
      };

      for (const r of data.resources) {
        expect(r.availableWindows.length).toBe(0);
      }
    });
  });
});
