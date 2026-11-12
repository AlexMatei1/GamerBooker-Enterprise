/**
 * Acceptance test suite for ENG-107: Client cancel/modify/extend and compensating workflows.
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

describe('ENG-107 Client Cancel/Modify/Extend & Compensating Workflows', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let customerA: { userId: string; cookie: string };
  let customerB: { userId: string; cookie: string };

  let roomId: string;
  let zoneId: string;
  const pcIds: string[] = [];

  beforeAll(async () => {
    try {
      app = await startTestApp('eng107', { browserClient: true });
      ownerFixture = await createTenantAndVenue(app, 'NextGen Gaming SRL', 'NextGen Lounge', 'OWNER');

      customerA = await app.verifiedUser();
      customerB = await app.verifiedUser();

      // Room
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [ownerFixture.venueId, 'Lounge Area'],
      );
      roomId = roomRes.rows[0].id;

      // Policy Profile with 3h free cancellation, 50% late fee, 4h reschedule cutoff, 15m no-show grace
      const policyRes = await app.db.query<{ id: string }>(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Flexible Gaming Policy', true, $2)
         RETURNING id`,
        [
          ownerFixture.venueId,
          JSON.stringify({
            prepaid_mode: 'FULL',
            deposit_percentage: 100,
            slot_granularity_minutes: 15,
            min_duration_minutes: 60,
            max_duration_minutes: 360,
            free_cancellation_hours: 3,
            late_cancellation_penalty_percent: 50,
            reschedule_cutoff_hours: 4,
            no_show_grace_minutes: 15,
            no_show_fee_percent: 100,
            deposit_mode_settlement: 'ONLINE_ONLY',
          }),
        ],
      );
      const policyId = policyRes.rows[0].id;

      // Zone linked to policy
      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [ownerFixture.venueId, roomId, 'Premium Zone', policyId],
      );
      zoneId = zoneRes.rows[0].id;

      // Resources (10 distinct PCs to isolate test intervals)
      for (let i = 1; i <= 10; i++) {
        const pc = await app.db.query<{ id: string }>(
          "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', $4, 'AVAILABLE', true) RETURNING id",
          [ownerFixture.venueId, roomId, zoneId, `PC-NEXT-${i < 10 ? '0' + i : i}`],
        );
        pcIds.push(pc.rows[0].id);
      }

      // Price rule: 20.00 RON/h (2000 bani)
      await app.db.query(
        "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 2000, 'RON')",
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

  async function createBookingHelper(
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
    const hold = holdRes.json as { id: string };

    // The confirm guard requires server-side proof of the upfront charge; the
    // fixture settles the hold the way the PSP webhook would.
    const upfrontIntentId = await app.settleHoldPayment(hold.id);
    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: userCookie },
      body: {
        hold_id: hold.id,
        ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
      },
    });
    expect(confirmRes.status).toBe(201);
    return confirmRes.json as {
      id: string;
      status: string;
      starts_at: string;
      ends_at: string;
      paid_minor: number;
      total_minor: number;
      version: number;
    };
  }

  describe('Policy-Governed Cancellation & Refund Calculation', () => {
    it('free cancellation >= 3h before start yields 100% refund, 0 penalty, and releases claims', async () => {
      // 5 hours in the future
      const now = new Date();
      const startsAt = new Date(now.getTime() + 5 * 3600 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 7 * 3600 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[0]], startsAt, endsAt);
      expect(booking.paid_minor).toBe(4000); // 2h @ 20.00 RON = 4000 bani

      // Cancel with policy
      const cancelRes = await app.call('POST', `/v1/bookings/${booking.id}/cancel-policy`, {
        headers: { cookie: customerA.cookie },
        body: { reason: 'Schedule conflict' },
      });

      expect(cancelRes.status).toBe(201);
      const data = cancelRes.json as {
        status: string;
        cancellation_type: string;
        penalty_minor: number;
        refundable_minor: number;
        refund_id: string;
      };

      expect(data.status).toBe('CANCELLED');
      expect(data.cancellation_type).toBe('FREE');
      expect(data.penalty_minor).toBe(0);
      expect(data.refundable_minor).toBe(4000);
      expect(typeof data.refund_id).toBe('string');

      // Verify refund record in DB
      const dbRefund = await app.db.query<{ amount_minor: string; status: string }>(
        'SELECT amount_minor, status FROM refunds WHERE id = $1',
        [data.refund_id],
      );
      expect(dbRefund.rows[0].amount_minor).toBe('4000');
      expect(dbRefund.rows[0].status).toBe('REQUESTED');

      // Verify claims state is CANCELLED
      const dbClaims = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE booking_id = $1',
        [booking.id],
      );
      expect(dbClaims.rows[0].state).toBe('CANCELLED');

      // Verify outbox has RefundRequested
      const dbOutbox = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'RefundRequested'",
        [data.refund_id],
      );
      expect(dbOutbox.rows).toHaveLength(1);
    });

    it('late cancellation < 3h before start applies 50% penalty and refunds 50%', async () => {
      // 1.5 hours in the future
      const now = new Date();
      const startsAt = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 210 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[1]], startsAt, endsAt);
      expect(booking.paid_minor).toBe(4000);

      const cancelRes = await app.call('POST', `/v1/bookings/${booking.id}/cancel-policy`, {
        headers: { cookie: customerA.cookie },
        body: { reason: 'Traffic jam' },
      });

      expect(cancelRes.status).toBe(201);
      const data = cancelRes.json as {
        status: string;
        cancellation_type: string;
        penalty_minor: number;
        refundable_minor: number;
        refund_id: string;
      };

      expect(data.status).toBe('CANCELLED');
      expect(data.cancellation_type).toBe('LATE_WITH_PENALTY');
      expect(data.penalty_minor).toBe(2000); // 50% of 4000 = 2000 bani
      expect(data.refundable_minor).toBe(2000);

      // Verify refund in DB
      const dbRefund = await app.db.query<{ amount_minor: string }>(
        'SELECT amount_minor FROM refunds WHERE id = $1',
        [data.refund_id],
      );
      expect(dbRefund.rows[0].amount_minor).toBe('2000');
    });

    it('rejects cancellation after session has already started (400 CANCELLATION_NOT_PERMITTED)', async () => {
      // Session started 10 minutes ago
      const now = new Date();
      const startsAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 110 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[2]], startsAt, endsAt);

      const cancelRes = await app.call('POST', `/v1/bookings/${booking.id}/cancel-policy`, {
        headers: { cookie: customerA.cookie },
      });

      expect(cancelRes.status).toBe(400);
      const err = app.errorOf(cancelRes);
      expect(err.code).toBe('CANCELLATION_NOT_PERMITTED');
    });
  });

  describe('Atomic Reschedule (Modify Slot / Resources)', () => {
    it('reschedules booking to new slot, swaps claims atomically, and increments version', async () => {
      // Slot A starts in 6 hours (cutoff is 4h)
      const now = new Date();
      const slotAStart = new Date(now.getTime() + 6 * 3600 * 1000).toISOString();
      const slotAEnd = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[3]], slotAStart, slotAEnd);
      expect(booking.version).toBe(1);

      // Create target hold for Slot B (starts in 24 hours)
      const slotBStart = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
      const slotBEnd = new Date(now.getTime() + 26 * 3600 * 1000).toISOString();

      const quoteBRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerA.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [pcIds[3]],
          starts_at: slotBStart,
          ends_at: slotBEnd,
        },
      });
      const quoteB = quoteBRes.json as { quote_id: string };

      const holdBRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quoteB.quote_id },
      });
      const holdB = holdBRes.json as { id: string };

      // Reschedule booking
      const rescheduleRes = await app.call('POST', `/v1/bookings/${booking.id}/reschedule`, {
        headers: { cookie: customerA.cookie },
        body: { new_hold_id: holdB.id, expected_version: 1, reason: 'Prefer evening slot' },
      });

      expect(rescheduleRes.status).toBe(201);
      const resData = rescheduleRes.json as {
        status: string;
        starts_at: string;
        ends_at: string;
        version: number;
      };

      expect(resData.status).toBe('CONFIRMED');
      expect(resData.starts_at).toBe(slotBStart);
      expect(resData.version).toBe(2);

      // Verify DB claims: old slot claims are CANCELLED, new slot claims are CONFIRMED
      const claimsSlotA = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE booking_id = $1 AND slot = tstzrange($2::timestamptz, $3::timestamptz, \'[)\')',
        [booking.id, slotAStart, slotAEnd],
      );
      expect(claimsSlotA.rows[0].state).toBe('CANCELLED');

      const claimsSlotB = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE booking_id = $1 AND slot = tstzrange($2::timestamptz, $3::timestamptz, \'[)\')',
        [booking.id, slotBStart, slotBEnd],
      );
      expect(claimsSlotB.rows[0].state).toBe('CONFIRMED');

      // Slot A can now be booked by Customer B without collision
      const holdCustomerB = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerB.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [pcIds[3]],
          starts_at: slotAStart,
          ends_at: slotAEnd,
        },
      });
      expect(holdCustomerB.status).toBe(201);
    });

    it('rejects reschedule within cutoff window (400 RESCHEDULE_CUTOFF_EXCEEDED)', async () => {
      // Slot starts in 2 hours (< 4 hours cutoff)
      const now = new Date();
      const startsAt = new Date(now.getTime() + 2 * 3600 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[4]], startsAt, endsAt);

      // Create new hold
      const futureStart = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
      const futureEnd = new Date(now.getTime() + 50 * 3600 * 1000).toISOString();

      const quoteRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerA.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [pcIds[4]],
          starts_at: futureStart,
          ends_at: futureEnd,
        },
      });
      const holdRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: (quoteRes.json as any).quote_id },
      });

      const rescheduleRes = await app.call('POST', `/v1/bookings/${booking.id}/reschedule`, {
        headers: { cookie: customerA.cookie },
        body: { new_hold_id: (holdRes.json as any).id, expected_version: 1 },
      });

      expect(rescheduleRes.status).toBe(400);
      const err = app.errorOf(rescheduleRes);
      expect(err.code).toBe('RESCHEDULE_CUTOFF_EXCEEDED');
    });
  });

  describe('Contiguous In-Session Extension', () => {
    it('extends session contiguously by 30 minutes, inserts extension claims, and updates totals', async () => {
      const now = new Date();
      const startsAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 120 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[5]], startsAt, endsAt);
      expect(booking.total_minor).toBe(2000); // 1h = 2000 bani

      // Request 30 min extension
      const extRes = await app.call('POST', `/v1/bookings/${booking.id}/extend`, {
        headers: { cookie: customerA.cookie },
        body: { additional_minutes: 30, expected_version: 1 },
      });

      expect(extRes.status).toBe(201);
      const extData = extRes.json as {
        extension_minutes: number;
        extension_cost_minor: number;
        new_total_minor: number;
        new_ends_at: string;
        version: number;
      };

      expect(extData.extension_minutes).toBe(30);
      expect(extData.extension_cost_minor).toBe(1000); // 30m @ 20.00 RON/h = 1000 bani
      expect(extData.new_total_minor).toBe(3000);
      expect(extData.version).toBe(2);

      // Verify booking ends_at in DB
      const dbBooking = await app.db.query<{ ends_at: Date; total_minor: string }>(
        'SELECT ends_at, total_minor FROM bookings WHERE id = $1',
        [booking.id],
      );
      expect(new Date(dbBooking.rows[0].ends_at).toISOString()).toBe(extData.new_ends_at);
      expect(dbBooking.rows[0].total_minor).toBe('3000');

      // Verify resource_claims has 2 rows for this booking (initial slot + extension slot)
      const dbClaims = await app.db.query(
        'SELECT * FROM resource_claims WHERE booking_id = $1 AND state = \'CONFIRMED\'',
        [booking.id],
      );
      expect(dbClaims.rows).toHaveLength(2);
    });

    it('rejects extension when contiguous slot is already held by another customer (409 EXTENSION_UNAVAILABLE)', async () => {
      const now = new Date();
      const startsAtA = new Date(now.getTime() + 180 * 60 * 1000).toISOString();
      const endsAtA = new Date(now.getTime() + 240 * 60 * 1000).toISOString();

      const bookingA = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[6]], startsAtA, endsAtA);

      // Customer B holds contiguous slot [endsAtA, endsAtA + 60m)
      const startsAtB = endsAtA;
      const endsAtB = new Date(new Date(startsAtB).getTime() + 60 * 60 * 1000).toISOString();

      const quoteB = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerB.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [pcIds[6]],
          starts_at: startsAtB,
          ends_at: endsAtB,
        },
      });
      await app.call('POST', '/v1/holds', {
        headers: { cookie: customerB.cookie },
        body: { quote_id: (quoteB.json as any).quote_id },
      });

      // Customer A tries to extend 30m (which collides with Customer B's hold)
      const extRes = await app.call('POST', `/v1/bookings/${bookingA.id}/extend`, {
        headers: { cookie: customerA.cookie },
        body: { additional_minutes: 30, expected_version: 1 },
      });

      expect(extRes.status).toBe(409);
      const err = app.errorOf(extRes);
      expect(err.code).toBe('EXTENSION_UNAVAILABLE');
    });
  });

  describe('Staff No-Show Verification & Equipment Release', () => {
    it('staff marks verified no-show after grace period and releases equipment', async () => {
      // Booking started 20 minutes ago (grace period is 15 minutes)
      const now = new Date();
      const startsAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 100 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[7]], startsAt, endsAt);

      // Staff verifies no-show
      const noShowRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/no-show`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { staff_verified_empty: true, expected_version: 1, notes: 'Seat physically empty' },
        },
      );

      expect(noShowRes.status).toBe(201);
      const data = noShowRes.json as {
        status: string;
        forfeited_minor: number;
        refundable_minor: number;
      };

      expect(data.status).toBe('NO_SHOW');
      expect(data.forfeited_minor).toBe(4000); // 100% forfeiture per policy
      expect(data.refundable_minor).toBe(0);

      // Verify equipment claims are RELEASED
      const dbClaims = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE booking_id = $1',
        [booking.id],
      );
      expect(dbClaims.rows[0].state).toBe('RELEASED');

      // Equipment is now re-bookable for remaining interval
      const newStartsAt = new Date().toISOString();
      const newQuote = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerB.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [pcIds[7]],
          starts_at: endsAt, // or future slot
          ends_at: new Date(new Date(endsAt).getTime() + 60 * 60 * 1000).toISOString(),
        },
      });
      expect(newQuote.status).toBe(201);
    });

    it('rejects no-show verification when staff_verified_empty is false (400 STAFF_VERIFICATION_REQUIRED)', async () => {
      const now = new Date();
      const startsAt = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 95 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[8]], startsAt, endsAt);

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/no-show`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { staff_verified_empty: false, expected_version: 1 },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('STAFF_VERIFICATION_REQUIRED');
    });

    it('rejects no-show verification while grace period is active (400 NO_SHOW_GRACE_ACTIVE)', async () => {
      // Session started only 5 minutes ago (< 15m grace)
      const now = new Date();
      const startsAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 115 * 60 * 1000).toISOString();

      const booking = await createBookingHelper(customerA.cookie, ownerFixture.venueId, [pcIds[9]], startsAt, endsAt);

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/no-show`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { staff_verified_empty: true, expected_version: 1 },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('NO_SHOW_GRACE_ACTIVE');
    });
  });
});
