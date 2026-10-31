/**
 * Acceptance test suite for ENG-105: Booking confirmation guard and state machine with audit/outbox.
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
  }

  return { ...user, tenantId, venueId };
}

describe('ENG-105 Booking Confirmation Guard & State Machine with Audit/Outbox', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;
  let customerA: { userId: string; cookie: string };
  let customerB: { userId: string; cookie: string };

  let roomId: string;
  let zoneId: string;
  let pc1Id: string;
  let pc2Id: string;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng105');
      ownerFixture = await createTenantAndVenue(app, 'Apex Gaming SRL', 'Apex Arena Bucharest', 'OWNER');
      foreignFixture = await createTenantAndVenue(app, 'Quantum Play SRL', 'Quantum Club Cluj', 'OWNER');

      customerA = await app.verifiedUser();
      customerB = await app.verifiedUser();

      // Room and zone
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [ownerFixture.venueId, 'PC Arena'],
      );
      roomId = roomRes.rows[0].id;

      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, $3) RETURNING id',
        [ownerFixture.venueId, roomId, 'VIP Zone'],
      );
      zoneId = zoneRes.rows[0].id;

      // Resources
      const pc1Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-APEX-01', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      pc1Id = pc1Res.rows[0].id;

      const pc2Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-APEX-02', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      pc2Id = pc2Res.rows[0].id;

      // Price rule: 25.00 RON/h (2500 bani)
      await app.db.query(
        "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 2500, 'RON')",
        [ownerFixture.venueId],
      );
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

  async function createHoldHelper(
    userCookie: string,
    venueId: string,
    resourceIds: string[],
    startsAt: string,
    endsAt: string,
  ) {
    const quoteRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: userCookie },
      body: { venue_id: venueId, resource_ids: resourceIds, starts_at: startsAt, ends_at: endsAt },
    });
    expect(quoteRes.status).toBe(201);
    const quote = quoteRes.json as { quote_id: string };

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: userCookie },
      body: { quote_id: quote.quote_id },
    });
    expect(holdRes.status).toBe(201);
    return holdRes.json as { id: string; status: string; starts_at: string; ends_at: string };
  }

  describe('Hold Confirmation Guard & Atomic Lock Conversion', () => {
    it('confirms active hold, transitions claims to CONFIRMED, and emits audit & outbox', async () => {
      const startsAt = '2026-11-10T14:00:00.000Z';
      const endsAt = '2026-11-10T16:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);

      // Confirm booking
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });

      expect(confirmRes.status).toBe(201);
      const booking = confirmRes.json as {
        id: string;
        public_code: string;
        status: string;
        hold_id: string;
        version: number;
        total_minor: number;
        due_now_minor: number;
      };

      expect(booking.status).toBe('CONFIRMED');
      expect(booking.public_code).toMatch(/^GB-[2-9A-HJ-NP-Z]{6}$/);
      expect(booking.hold_id).toBe(hold.id);
      expect(booking.version).toBe(1);

      // 1. Verify hold status is CONSUMED
      const holdDb = await app.db.query<{ status: string }>('SELECT status FROM holds WHERE id = $1', [
        hold.id,
      ]);
      expect(holdDb.rows[0].status).toBe('CONSUMED');

      // 2. Verify resource_claims is CONFIRMED and references booking.id
      const claimsDb = await app.db.query<{ state: string; booking_id: string }>(
        'SELECT state, booking_id FROM resource_claims WHERE hold_id = $1',
        [hold.id],
      );
      expect(claimsDb.rows).toHaveLength(1);
      expect(claimsDb.rows[0].state).toBe('CONFIRMED');
      expect(claimsDb.rows[0].booking_id).toBe(booking.id);

      // 3. Verify audit_events record
      const auditDb = await app.db.query<{ action: string; target_id: string }>(
        "SELECT action, target_id FROM audit_events WHERE target_id = $1 AND action = 'BOOKING_CONFIRMED'",
        [booking.id],
      );
      expect(auditDb.rows).toHaveLength(1);

      // 4. Verify outbox_events record
      const outboxDb = await app.db.query<{ event_type: string; payload: any }>(
        "SELECT event_type, payload FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'BookingConfirmed'",
        [booking.id],
      );
      expect(outboxDb.rows).toHaveLength(1);
      expect(outboxDb.rows[0].payload.booking_id).toBe(booking.id);
      expect(outboxDb.rows[0].payload.public_code).toBe(booking.public_code);
    });

    it('rejects confirmation when hold has expired (409 HOLD_EXPIRED)', async () => {
      const startsAt = '2026-11-10T18:00:00.000Z';
      const endsAt = '2026-11-10T20:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);

      // Advance expires_at into the past
      await app.db.query("UPDATE holds SET expires_at = now() - interval '1 minute' WHERE id = $1", [
        hold.id,
      ]);

      const res = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('HOLD_EXPIRED');

      // No booking created
      const bookingDb = await app.db.query('SELECT * FROM bookings WHERE hold_id = $1', [hold.id]);
      expect(bookingDb.rows).toHaveLength(0);
    });

    it('rejects confirmation when hold is not in ACTIVE state (409 HOLD_NOT_ACTIVE)', async () => {
      const startsAt = '2026-11-11T10:00:00.000Z';
      const endsAt = '2026-11-11T12:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);

      // Release hold first
      const releaseRes = await app.call('POST', `/v1/holds/${hold.id}/release`, {
        headers: { cookie: customerA.cookie },
      });
      expect(releaseRes.status).toBe(201);

      // Attempt to confirm released hold
      const res = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('HOLD_NOT_ACTIVE');
    });

    it('idempotent confirmation returns existing booking without duplicates', async () => {
      const startsAt = '2026-11-11T14:00:00.000Z';
      const endsAt = '2026-11-11T16:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc2Id], startsAt, endsAt);
      const idempotencyKey = 'confirm-idem-key-888';

      // First confirmation
      const res1 = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie, 'idempotency-key': idempotencyKey },
        body: { hold_id: hold.id },
      });
      expect(res1.status).toBe(201);
      const booking1 = res1.json as { id: string };

      // Replay with identical idempotency key
      const res2 = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie, 'idempotency-key': idempotencyKey },
        body: { hold_id: hold.id },
      });
      expect(res2.status).toBe(201);
      const booking2 = res2.json as { id: string };

      expect(booking2.id).toBe(booking1.id);

      // Exactly 1 booking in database
      const dbBookings = await app.db.query('SELECT * FROM bookings WHERE hold_id = $1', [hold.id]);
      expect(dbBookings.rows).toHaveLength(1);
    });
  });

  describe('Guarded State Machine Lifecycle & Concurrency', () => {
    it('progresses through CONFIRMED -> CHECKED_IN -> COMPLETED with optimistic version increment', async () => {
      const startsAt = '2026-11-12T10:00:00.000Z';
      const endsAt = '2026-11-12T12:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      expect(confirmRes.status).toBe(201);
      const booking = confirmRes.json as { id: string; version: number };
      expect(booking.version).toBe(1);

      // Step 1: Staff check-in (CONFIRMED -> CHECKED_IN)
      const checkinRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/transition`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { target_status: 'CHECKED_IN', expected_version: 1 },
        },
      );
      expect(checkinRes.status).toBe(201);
      const checkedInBooking = checkinRes.json as { status: string; version: number };
      expect(checkedInBooking.status).toBe('CHECKED_IN');
      expect(checkedInBooking.version).toBe(2);

      // Outbox has CheckedIn
      const outbox1 = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'CheckedIn'",
        [booking.id],
      );
      expect(outbox1.rows).toHaveLength(1);

      // Step 2: Staff completes session (CHECKED_IN -> COMPLETED)
      const completeRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/transition`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { target_status: 'COMPLETED', expected_version: 2 },
        },
      );
      expect(completeRes.status).toBe(201);
      const completedBooking = completeRes.json as { status: string; version: number };
      expect(completedBooking.status).toBe('COMPLETED');
      expect(completedBooking.version).toBe(3);

      // Outbox has BookingCompleted
      const outbox2 = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'BookingCompleted'",
        [booking.id],
      );
      expect(outbox2.rows).toHaveLength(1);
    });

    it('rejects invalid state machine transition (400 INVALID_STATE_TRANSITION)', async () => {
      const startsAt = '2026-11-12T14:00:00.000Z';
      const endsAt = '2026-11-12T16:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc2Id], startsAt, endsAt);
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const booking = confirmRes.json as { id: string };

      // Invalid transition: CONFIRMED -> COMPLETED directly (skipping CHECKED_IN)
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/transition`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { target_status: 'COMPLETED', expected_version: 1 },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('rejects optimistic version mismatch (409 CONCURRENCY_CONFLICT)', async () => {
      const startsAt = '2026-11-12T18:00:00.000Z';
      const endsAt = '2026-11-12T20:00:00.000Z';

      const hold = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const booking = confirmRes.json as { id: string };

      // Wrong version: expected 99 instead of 1
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/transition`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { target_status: 'CHECKED_IN', expected_version: 99 },
        },
      );

      expect(res.status).toBe(409);
      const err = app.errorOf(res);
      expect(err.code).toBe('CONCURRENCY_CONFLICT');
    });
  });

  describe('Cancellation & Claim Freeing (GiST Exclusion Release)', () => {
    it('cancelling a confirmed booking marks claims CANCELLED and allows slot re-booking', async () => {
      const startsAt = '2026-11-13T10:00:00.000Z';
      const endsAt = '2026-11-13T12:00:00.000Z';

      // Customer A books PC 1
      const holdA = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);
      const confirmResA = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: holdA.id },
      });
      expect(confirmResA.status).toBe(201);
      const bookingA = confirmResA.json as { id: string; version: number };

      // Customer A cancels booking
      const cancelRes = await app.call('POST', `/v1/bookings/${bookingA.id}/cancel`, {
        headers: { cookie: customerA.cookie },
        body: { expected_version: 1, reason: 'Change of plans' },
      });
      expect(cancelRes.status).toBe(201);
      const cancelledBooking = cancelRes.json as { status: string };
      expect(cancelledBooking.status).toBe('CANCELLED');

      // Verify claims state is CANCELLED in database
      const claimsDb = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE booking_id = $1',
        [bookingA.id],
      );
      expect(claimsDb.rows[0].state).toBe('CANCELLED');

      // Verify outbox has BookingCancelled
      const outbox = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'BookingCancelled'",
        [bookingA.id],
      );
      expect(outbox.rows).toHaveLength(1);

      // Customer B can now immediately hold that exact same slot without exclusion collision
      const holdB = await createHoldHelper(customerB.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);
      expect(holdB.status).toBe('ACTIVE');
    });
  });

  describe('RBAC & Cross-Tenant Boundaries', () => {
    it('denies customer from accessing another customer booking (403 FORBIDDEN)', async () => {
      const startsAt = '2026-11-14T14:00:00.000Z';
      const endsAt = '2026-11-14T16:00:00.000Z';

      const holdA = await createHoldHelper(customerA.cookie, ownerFixture.venueId, [pc1Id], startsAt, endsAt);
      const confirmA = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: holdA.id },
      });
      const bookingA = confirmA.json as { id: string; public_code: string };

      // Customer B tries to read Customer A's booking
      const res = await app.call('GET', `/v1/bookings/${bookingA.id}`, {
        headers: { cookie: customerB.cookie },
      });
      expect(res.status).toBe(403);
      const err = app.errorOf(res);
      expect(err.code).toBe('FORBIDDEN');

      // Customer B tries to read via public code
      const codeRes = await app.call('GET', `/v1/bookings/code/${bookingA.public_code}`, {
        headers: { cookie: customerB.cookie },
      });
      expect(codeRes.status).toBe(403);
    });

    it('denies foreign venue manager from accessing venue bookings (404/403 cross-tenant isolation)', async () => {
      // Foreign venue owner tries to list Nexus Arena bookings
      const res = await app.call('GET', `/v1/dashboard/venues/${ownerFixture.venueId}/bookings`, {
        headers: { cookie: foreignFixture.cookie },
      });
      expect([403, 404]).toContain(res.status);
    });
  });
});
