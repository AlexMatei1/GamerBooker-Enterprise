/**
 * Acceptance test suite for ENG-106: Solo checkout (FULL and DEPOSIT), QR, balance display.
 */
import { startTestApp, type TestApp } from './support/auth-harness';
import { CheckoutService } from '../src/bookings/checkout.service';
import { BookingsService } from '../src/bookings/bookings.service';

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

describe('ENG-106 Solo Checkout (FULL and DEPOSIT), QR, Balance Display', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;
  let customerA: { userId: string; cookie: string };
  let customerB: { userId: string; cookie: string };
  let checkoutService: CheckoutService;

  let roomId: string;
  let fullZoneId: string;
  let depositZoneId: string;
  let fullPc1Id: string;
  let depositPcId: string;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng106');
      ownerFixture = await createTenantAndVenue(app, 'CyberArena SRL', 'CyberArena Bucharest', 'OWNER');
      foreignFixture = await createTenantAndVenue(app, 'TitanClub SRL', 'Titan Club Brasov', 'OWNER');

      customerA = await app.verifiedUser();
      customerB = await app.verifiedUser();

      checkoutService = new CheckoutService(new BookingsService());

      // Room
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [ownerFixture.venueId, 'Arena Hall'],
      );
      roomId = roomRes.rows[0].id;

      // 1. Full Prepaid Policy Profile
      const fullPolicyRes = await app.db.query<{ id: string }>(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Full Prepaid Policy', false, $2)
         RETURNING id`,
        [
          ownerFixture.venueId,
          JSON.stringify({
            prepaid_mode: 'FULL',
            deposit_percentage: 100,
            slot_granularity_minutes: 15,
            min_duration_minutes: 60,
            max_duration_minutes: 360,
            cancel_cutoff_hours: 2,
            late_cancel_fee_percent: 50,
            no_show_fee_percent: 100,
            grace_period_minutes: 15,
            reschedule_cutoff_hours: 4,
            remaining_payment_methods: ['ONLINE_ONLY'],
          }),
        ],
      );
      const fullPolicyId = fullPolicyRes.rows[0].id;

      // 2. Deposit Policy Profile (40% deposit)
      const depPolicyRes = await app.db.query<{ id: string }>(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Deposit Policy', false, $2)
         RETURNING id`,
        [
          ownerFixture.venueId,
          JSON.stringify({
            prepaid_mode: 'DEPOSIT',
            deposit_percentage: 40,
            deposit_mode_settlement: 'ONLINE_OR_RECEPTION',
            slot_granularity_minutes: 15,
            min_duration_minutes: 60,
            max_duration_minutes: 360,
            cancel_cutoff_hours: 2,
            late_cancel_fee_percent: 50,
            no_show_fee_percent: 100,
            grace_period_minutes: 15,
            reschedule_cutoff_hours: 4,
          }),
        ],
      );
      const depPolicyId = depPolicyRes.rows[0].id;

      // Zones linked to policy profiles
      const z1 = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [ownerFixture.venueId, roomId, 'Full Prepaid Zone', fullPolicyId],
      );
      fullZoneId = z1.rows[0].id;

      const z2 = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [ownerFixture.venueId, roomId, 'Deposit Zone', depPolicyId],
      );
      depositZoneId = z2.rows[0].id;

      // Resources
      const pc1 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-FULL-01', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, fullZoneId],
      );
      fullPc1Id = pc1.rows[0].id;

      const pc2 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-DEP-01', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, depositZoneId],
      );
      depositPcId = pc2.rows[0].id;

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

  async function createHold(
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
    const quote = quoteRes.json as { quote_id: string; total_minor: number; due_now_minor: number };

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: userCookie },
      body: { quote_id: quote.quote_id },
    });
    expect(holdRes.status).toBe(201);
    return holdRes.json as { id: string; status: string };
  }

  describe('Solo Checkout (FULL and DEPOSIT)', () => {
    it('executes FULL solo checkout with zero balance and returns signed QR token', async () => {
      const startsAt = '2026-11-20T14:00:00.000Z';
      const endsAt = '2026-11-20T16:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [fullPc1Id], startsAt, endsAt);

      // Solo Checkout
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id, payment_method: 'CARD_ONLINE' },
      });

      expect(checkoutRes.status).toBe(201);
      const data = checkoutRes.json as {
        booking: {
          id: string;
          status: string;
          total_minor: number;
          due_now_minor: number;
          paid_minor: number;
          balance_minor: number;
        };
        qr_token: string;
        qr_expires_at: string;
      };

      expect(data.booking.status).toBe('CONFIRMED');
      // 2h @ 20.00 RON/h = 4000 bani
      expect(data.booking.total_minor).toBe(4000);
      expect(data.booking.due_now_minor).toBe(4000);
      expect(data.booking.paid_minor).toBe(4000);
      expect(data.booking.balance_minor).toBe(0);
      expect(typeof data.qr_token).toBe('string');

      // Verify Balance API
      const balanceRes = await app.call('GET', `/v1/bookings/${data.booking.id}/balance`, {
        headers: { cookie: customerA.cookie },
      });
      expect(balanceRes.status).toBe(200);
      const balanceData = balanceRes.json as {
        is_fully_paid: boolean;
        balance_minor: number;
        prepaid_mode: string;
      };
      expect(balanceData.is_fully_paid).toBe(true);
      expect(balanceData.balance_minor).toBe(0);
      expect(balanceData.prepaid_mode).toBe('FULL');
    });

    it('executes DEPOSIT solo checkout with outstanding gaming balance', async () => {
      const startsAt = '2026-11-21T14:00:00.000Z';
      const endsAt = '2026-11-21T16:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [depositPcId], startsAt, endsAt);

      // Solo Checkout
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id, payment_method: 'CARD_ONLINE' },
      });

      expect(checkoutRes.status).toBe(201);
      const data = checkoutRes.json as {
        booking: {
          id: string;
          status: string;
          total_minor: number;
          due_now_minor: number;
          paid_minor: number;
          balance_minor: number;
        };
        qr_token: string;
      };

      expect(data.booking.status).toBe('CONFIRMED');
      // 2h @ 20.00 RON = 4000 bani total, 40% deposit = 1600 bani due now, balance = 2400 bani
      expect(data.booking.total_minor).toBe(4000);
      expect(data.booking.due_now_minor).toBe(1600);
      expect(data.booking.paid_minor).toBe(1600);
      expect(data.booking.balance_minor).toBe(2400);

      // Balance API
      const balanceRes = await app.call('GET', `/v1/bookings/${data.booking.id}/balance`, {
        headers: { cookie: customerA.cookie },
      });
      expect(balanceRes.status).toBe(200);
      const balanceData = balanceRes.json as {
        is_fully_paid: boolean;
        balance_minor: number;
        prepaid_mode: string;
        deposit_percentage: number;
        remaining_payment_methods: string[];
      };
      expect(balanceData.is_fully_paid).toBe(false);
      expect(balanceData.balance_minor).toBe(2400);
      expect(balanceData.prepaid_mode).toBe('DEPOSIT');
      expect(balanceData.deposit_percentage).toBe(40);
      expect(balanceData.remaining_payment_methods).toEqual(['ONLINE_OR_RECEPTION']);
    });
  });

  describe('Rolling QR Token Generation & Verification', () => {
    it('customer fetches signed rolling QR token and service verifies cryptographic signature', async () => {
      const startsAt = '2026-11-22T10:00:00.000Z';
      const endsAt = '2026-11-22T12:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [fullPc1Id], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const booking = (checkoutRes.json as any).booking;

      // Customer fetches QR token
      const qrRes = await app.call('GET', `/v1/bookings/${booking.id}/qr`, {
        headers: { cookie: customerA.cookie },
      });
      expect(qrRes.status).toBe(200);
      const qrData = qrRes.json as { token: string; public_code: string; expires_at: string };
      expect(qrData.public_code).toBe(booking.public_code);

      // Cryptographic verification
      const verified = checkoutService.verifyQrToken(qrData.token);
      expect(verified.bookingId).toBe(booking.id);
      expect(verified.publicCode).toBe(booking.public_code);
      expect(verified.venueId).toBe(ownerFixture.venueId);
    });

    it('rejects tampered QR signature (400 QR_SIGNATURE_INVALID)', async () => {
      const startsAt = '2026-11-22T14:00:00.000Z';
      const endsAt = '2026-11-22T16:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [fullPc1Id], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const qrToken = (checkoutRes.json as any).qr_token;

      // Decode, tamper public code, and re-encode without updating signature
      const raw = JSON.parse(Buffer.from(qrToken, 'base64url').toString('utf8'));
      raw.c = 'GB-FAKE01';
      const tamperedToken = Buffer.from(JSON.stringify(raw)).toString('base64url');

      const scanRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/checkin`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { qr_token: tamperedToken },
        },
      );
      expect(scanRes.status).toBe(400);
      const err = app.errorOf(scanRes);
      expect(err.code).toBe('QR_SIGNATURE_INVALID');
    });
  });

  describe('Staff QR Check-in Scanner & Replay Protection', () => {
    it('staff checks in booking via QR scan and blocks duplicate replay (409 ALREADY_CHECKED_IN)', async () => {
      // Create session in a simulated active window
      const now = new Date();
      const startsAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // starts in 5 minutes
      const endsAt = new Date(now.getTime() + 125 * 60 * 1000).toISOString();

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [fullPc1Id], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const { booking, qr_token } = checkoutRes.json as any;

      // 1. Staff scans QR code within valid window
      const checkinRes1 = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/checkin`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { qr_token },
        },
      );

      expect(checkinRes1.status).toBe(201);
      const checkinData = checkinRes1.json as {
        status: string;
        booking_id: string;
        public_code: string;
        redeemed_at: string;
      };
      expect(checkinData.status).toBe('CHECKED_IN');
      expect(checkinData.booking_id).toBe(booking.id);

      // Verify checkin DB row
      const dbCheckin = await app.db.query<{ booking_id: string }>(
        'SELECT booking_id FROM checkins WHERE booking_id = $1',
        [booking.id],
      );
      expect(dbCheckin.rows).toHaveLength(1);

      // 2. Replay scan attempt: same QR code scanned again
      const checkinRes2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/checkin`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { qr_token },
        },
      );

      expect(checkinRes2.status).toBe(409);
      const err = app.errorOf(checkinRes2);
      expect(err.code).toBe('ALREADY_CHECKED_IN');

      // Verify no duplicate checkins row created
      const countCheckin = await app.db.query(
        'SELECT count(*)::int FROM checkins WHERE booking_id = $1',
        [booking.id],
      );
      expect(countCheckin.rows[0].count).toBe(1);
    });

    it('rejects check-in when attempted too early before session window (400 CHECKIN_TOO_EARLY)', async () => {
      // Session starts tomorrow
      const startsAt = '2026-11-25T14:00:00.000Z';
      const endsAt = '2026-11-25T16:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [fullPc1Id], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const { qr_token } = checkoutRes.json as any;

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/checkin`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { qr_token },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('CHECKIN_TOO_EARLY');
    });

    it('rejects cross-venue QR scan (403 VENUE_MISMATCH)', async () => {
      const now = new Date();
      const startsAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const endsAt = new Date(now.getTime() + 125 * 60 * 1000).toISOString();

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [depositPcId], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const { qr_token } = checkoutRes.json as any;

      // Foreign venue owner attempts to scan Nexus Arena QR token
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${foreignFixture.venueId}/checkin`,
        {
          headers: { cookie: foreignFixture.cookie },
          body: { qr_token },
        },
      );

      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Reception Balance Settlement & Offline Receipts', () => {
    it('staff settles outstanding deposit balance at reception with offline receipt', async () => {
      const startsAt = '2026-11-26T10:00:00.000Z';
      const endsAt = '2026-11-26T12:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [depositPcId], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const booking = (checkoutRes.json as any).booking;
      // Remaining balance = 2400 bani
      expect(booking.balance_minor).toBe(2400);

      // Reception staff records cash payment of 2400 bani
      const payRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/pay-balance`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            amount_minor: 2400,
            payment_method: 'CASH',
            reference: 'CASH-RECEIPT-202611-001',
            notes: 'Settled at front desk by customer',
          },
        },
      );

      expect(payRes.status).toBe(201);
      const receipt = payRes.json as {
        id: string;
        amount_minor: number;
        payment_method: string;
        reference: string;
      };
      expect(receipt.amount_minor).toBe(2400);
      expect(receipt.payment_method).toBe('CASH');

      // Verify booking balance in DB is now 0 and fully paid
      const balanceRes = await app.call('GET', `/v1/bookings/${booking.id}/balance`, {
        headers: { cookie: customerA.cookie },
      });
      const balanceData = balanceRes.json as {
        is_fully_paid: boolean;
        balance_minor: number;
        paid_minor: number;
      };
      expect(balanceData.is_fully_paid).toBe(true);
      expect(balanceData.balance_minor).toBe(0);
      expect(balanceData.paid_minor).toBe(4000);

      // Verify offline_receipts row in database
      const dbReceipt = await app.db.query(
        'SELECT * FROM offline_receipts WHERE booking_id = $1',
        [booking.id],
      );
      expect(dbReceipt.rows).toHaveLength(1);

      // Verify outbox has BalancePaid event
      const dbOutbox = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'BalancePaid'",
        [booking.id],
      );
      expect(dbOutbox.rows).toHaveLength(1);
    });

    it('rejects payment amount exceeding outstanding balance (400 OVERPAYMENT_NOT_ALLOWED)', async () => {
      const startsAt = '2026-11-26T14:00:00.000Z';
      const endsAt = '2026-11-26T16:00:00.000Z';

      const hold = await createHold(customerA.cookie, ownerFixture.venueId, [depositPcId], startsAt, endsAt);
      const checkoutRes = await app.call('POST', '/v1/checkout/solo', {
        headers: { cookie: customerA.cookie },
        body: { hold_id: hold.id },
      });
      const booking = (checkoutRes.json as any).booking;

      // Attempt to pay 5000 bani when outstanding balance is only 2400 bani
      const payRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/bookings/${booking.id}/pay-balance`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            amount_minor: 5000,
            payment_method: 'POS_TERMINAL',
            reference: 'POS-TXN-999',
          },
        },
      );

      expect(payRes.status).toBe(400);
      const err = app.errorOf(payRes);
      expect(err.code).toBe('OVERPAYMENT_NOT_ALLOWED');
    });
  });
});
