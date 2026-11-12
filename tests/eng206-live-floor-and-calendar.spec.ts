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
  ownerUser.cookie = await app.elevateMfa(ownerUser.cookie);

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
  managerUser.cookie = await app.elevateMfa(managerUser.cookie);

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

describe('ENG-206 Live Floor and Calendar, Check-in Queue, Maintenance Blocks', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customerA: { userId: string; cookie: string };
  let roomId: string;
  let zoneId: string;
  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng206', { browserClient: true });
      fixtures = await createVenueWithRoles(app, 'Cyber Operations SRL', 'Cyber Arena Downtown');
      customerA = await app.verifiedUser();

      // Room and Zone
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [fixtures.venueId, 'Arena Level 1'],
      );
      roomId = roomRes.rows[0].id;

      // Policy profile
      const policyRes = await app.db.query<{ id: string }>(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Arena Standard Policy', true, $2)
         RETURNING id`,
        [
          fixtures.venueId,
          JSON.stringify({
            prepaid_mode: 'FULL',
            deposit_percentage: 100,
            slot_granularity_minutes: 15,
            min_duration_minutes: 60,
            max_duration_minutes: 360,
            free_cancellation_hours: 2,
            late_cancellation_penalty_percent: 50,
            reschedule_cutoff_hours: 2,
            no_show_grace_minutes: 15,
            no_show_fee_percent: 100,
            deposit_mode_settlement: 'ONLINE_ONLY',
          }),
        ],
      );
      const policyId = policyRes.rows[0].id;

      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [fixtures.venueId, roomId, 'PC Station Zone', policyId],
      );
      zoneId = zoneRes.rows[0].id;

      // Price rule
      await app.db.query(
        "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')",
        [fixtures.venueId],
      );

      // Resources
      const pc1 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'STATION-01', 'AVAILABLE', true) RETURNING id",
        [fixtures.venueId, roomId, zoneId],
      );
      pc1Id = pc1.rows[0].id;

      const pc2 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'STATION-02', 'AVAILABLE', true) RETURNING id",
        [fixtures.venueId, roomId, zoneId],
      );
      pc2Id = pc2.rows[0].id;

      const pc3 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'STATION-03', 'AVAILABLE', true) RETURNING id",
        [fixtures.venueId, roomId, zoneId],
      );
      pc3Id = pc3.rows[0].id;
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

  describe('Live Floor Real-time Status & Booking Hierarchy', () => {
    let bookingId: string;
    let publicCode: string;

    it('reports all resources as AVAILABLE initially', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/live-floor`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const floor = res.json as any;
      expect(floor.summary.total_resources).toBe(3);
      expect(floor.summary.available).toBe(3);
      expect(floor.summary.booked).toBe(0);
      expect(floor.summary.occupied).toBe(0);

      const r1 = floor.resources.find((r: any) => r.resource_id === pc1Id);
      expect(r1.current_status).toBe('AVAILABLE');
      expect(r1.active_booking).toBeNull();
    });

    it('dynamically reflects BOOKED status when a confirmed booking overlaps now', async () => {
      // Create confirmed booking covering now
      const now = new Date();
      const startsAt = new Date(now.getTime() - 15 * 60 * 1000).toISOString(); // started 15m ago
      const endsAt = new Date(now.getTime() + 45 * 60 * 1000).toISOString();   // ends in 45m

      publicCode = 'GB-FLR101';
      const qRes = await app.db.query<{ id: string }>(
        `INSERT INTO price_quotes (
          venue_id, customer_id, starts_at, ends_at,
          items_snapshot, policy_snapshot,
          total_minor, due_now_minor, balance_minor, currency,
          signature, expires_at
        ) VALUES ($1, $2, $3, $4, '[]', '{}', 3000, 3000, 0, 'RON', 'test-sig', $4)
        RETURNING id`,
        [fixtures.venueId, customerA.userId, startsAt, endsAt],
      );
      const quoteId = qRes.rows[0].id;

      const bRes = await app.db.query<{ id: string }>(
        `INSERT INTO bookings (
          tenant_id, venue_id, customer_id, quote_id, public_code, status, starts_at, ends_at,
          resource_ids, atomic_resource_ids, total_minor, due_now_minor, paid_minor, balance_minor,
          currency, price_snapshot, policy_snapshot
        ) VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, $7, $8, $8, 3000, 3000, 3000, 0, 'RON', '{}', '{}')
        RETURNING id`,
        [fixtures.tenantId, fixtures.venueId, customerA.userId, quoteId, publicCode, startsAt, endsAt, [pc1Id]],
      );
      bookingId = bRes.rows[0].id;

      // Insert claim
      await app.db.query(
        `INSERT INTO resource_claims (
          resource_id, tenant_id, booking_id, holder_id, claim_type, state, slot
        ) VALUES ($1, $2, $3, $4, 'BOOKING', 'CONFIRMED', tstzrange($5::timestamptz, $6::timestamptz, '[)'))`,
        [pc1Id, fixtures.tenantId, bookingId, customerA.userId, startsAt, endsAt],
      );

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/live-floor`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const floor = res.json as any;
      expect(floor.summary.booked).toBe(1);
      expect(floor.summary.available).toBe(2);

      const r1 = floor.resources.find((r: any) => r.resource_id === pc1Id);
      expect(r1.current_status).toBe('BOOKED');
      expect(r1.active_booking).toBeDefined();
      expect(r1.active_booking.public_code).toBe(publicCode);
      expect(r1.active_booking.customer_email_masked).toBeDefined();
      expect(r1.active_booking.customer_email_masked).not.toBe('');
      // Masking verification: should contain ***
      expect(r1.active_booking.customer_email_masked).toContain('***');
    });

    it('transitions resource to OCCUPIED when booking status is CHECKED_IN', async () => {
      // Transition booking to CHECKED_IN
      await app.db.query(
        "UPDATE bookings SET status = 'CHECKED_IN', updated_at = now() WHERE id = $1",
        [bookingId],
      );

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/live-floor`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      const floor = res.json as any;
      expect(floor.summary.occupied).toBe(1);
      expect(floor.summary.booked).toBe(0);

      const r1 = floor.resources.find((r: any) => r.resource_id === pc1Id);
      expect(r1.current_status).toBe('OCCUPIED');
      expect(r1.active_booking.status).toBe('CHECKED_IN');
    });
  });

  describe('Reservations Calendar & Check-in Queue', () => {
    it('aggregates bookings in calendar view with financial metrics and status counts', async () => {
      const from = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const cal = res.json as any;
      expect(cal.summary.total_bookings).toBeGreaterThanOrEqual(1);
      expect(cal.summary.checked_in_count).toBeGreaterThanOrEqual(1);
      expect(cal.summary.total_revenue_minor).toBeGreaterThanOrEqual(3000);
      expect(cal.bookings.length).toBeGreaterThanOrEqual(1);

      const item = cal.bookings[0];
      expect(item.public_code).toBeDefined();
      expect(item.resource_names).toBeDefined();
      expect(item.customer.email_masked).toContain('***');
    });

    it('returns upcoming eligible bookings in the check-in queue', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/checkin-queue`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const queue = res.json as any;
      expect(queue.items.length).toBeGreaterThanOrEqual(1);
      const first = queue.items[0];
      expect(first.public_code).toBeDefined();
      expect(first.is_paid_in_full).toBe(true);
      expect(first.is_ready_for_checkin).toBe(true);
      expect(first.resources.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Maintenance Blocks & GiST Exclusion Guard', () => {
    let maintenanceBlockId: string;
    const futureMaintStart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const futureMaintEnd = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

    it('schedules a maintenance block on an idle resource and creates exclusion claim', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc2Id}/maintenance-blocks`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            reason: 'Liquid cooling refilling and GPU cleaning',
            starts_at: futureMaintStart,
            ends_at: futureMaintEnd,
          },
        },
      );

      expect(res.status).toBe(201);
      const block = (res.json as any).maintenance_block;
      expect(block.reason).toBe('Liquid cooling refilling and GPU cleaning');
      expect(block.status).toBe('ACTIVE');
      maintenanceBlockId = block.id;

      // Verify DB claim inserted with MAINTENANCE type
      const claimRes = await app.db.query<{ claim_type: string; state: string }>(
        'SELECT claim_type, state FROM resource_claims WHERE resource_id = $1 AND claim_type = $2',
        [pc2Id, 'MAINTENANCE'],
      );
      expect(claimRes.rowCount).toBe(1);
      expect(claimRes.rows[0].claim_type).toBe('MAINTENANCE');
      expect(claimRes.rows[0].state).toBe('CONFIRMED');

      // Verify list endpoint
      const listRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/maintenance-blocks`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(listRes.status).toBe(200);
      const blocks = (listRes.json as any).maintenance_blocks;
      expect(blocks.some((b: any) => b.id === maintenanceBlockId)).toBe(true);
    });

    it('rejects scheduling maintenance when interval collides with existing booking (409 RESOURCE_MAINTENANCE_CONFLICT)', async () => {
      // pc1Id has active booking overlapping [now - 15m, now + 45m]
      const now = new Date();
      const collStart = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const collEnd = new Date(now.getTime() + 25 * 60 * 1000).toISOString();

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc1Id}/maintenance-blocks`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            reason: 'Attempted emergency maintenance during match',
            starts_at: collStart,
            ends_at: collEnd,
          },
        },
      );

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('RESOURCE_MAINTENANCE_CONFLICT');
    });

    it('reflects active maintenance block as MAINTENANCE on live floor when window is active', async () => {
      // Create maintenance block active now on pc3Id
      const now = new Date();
      const startNow = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
      const endNow = new Date(now.getTime() + 50 * 60 * 1000).toISOString();

      const maintRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc3Id}/maintenance-blocks`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            reason: 'Replacing faulty keyboard and mouse',
            starts_at: startNow,
            ends_at: endNow,
          },
        },
      );
      expect(maintRes.status).toBe(201);
      const nowBlockId = (maintRes.json as any).maintenance_block.id;

      // Check live floor
      const floorRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/live-floor`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(floorRes.status).toBe(200);
      const floor = floorRes.json as any;
      const r3 = floor.resources.find((r: any) => r.resource_id === pc3Id);
      expect(r3.current_status).toBe('MAINTENANCE');
      expect(r3.active_maintenance).toBeDefined();
      expect(r3.active_maintenance.reason).toBe('Replacing faulty keyboard and mouse');

      // Cancel the nowBlock
      const cancelRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/maintenance-blocks/${nowBlockId}/cancel`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );
      expect(cancelRes.status).toBe(200);
      expect((cancelRes.json as any).cancelled).toBe(true);

      // Floor reverts to AVAILABLE
      const floorResAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/live-floor`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const r3After = (floorResAfter.json as any).resources.find((r: any) => r.resource_id === pc3Id);
      expect(r3After.current_status).toBe('AVAILABLE');
    });

    it('cancels scheduled maintenance block and releases exclusion claim', async () => {
      const cancelRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/maintenance-blocks/${maintenanceBlockId}/cancel`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(cancelRes.status).toBe(200);
      expect((cancelRes.json as any).cancelled).toBe(true);

      // Verify claim state is RELEASED
      const claimCheck = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE resource_id = $1 AND claim_type = $2',
        [pc2Id, 'MAINTENANCE'],
      );
      expect(claimCheck.rows[0].state).toBe('RELEASED');
    });

    it('prevents RECEPTION staff from creating or cancelling maintenance blocks (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const createRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/resources/${pc2Id}/maintenance-blocks`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            reason: 'Unauthorized maintenance',
            starts_at: futureMaintStart,
            ends_at: futureMaintEnd,
          },
        },
      );
      expect(createRes.status).toBe(403);
      expect(app.errorOf(createRes).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });
});
