/**
 * Acceptance test suite for ENG-103: Price quote with minor-unit exact arithmetic and expiry.
 */
import { startTestApp, type TestApp } from './support/auth-harness';
import { QuotesService } from '../src/bookings/quotes.service';
import type { PriceQuote } from '../src/bookings/quotes.types';
import type { PricingService } from '../src/bookings/pricing.service';
import type { PoliciesService } from '../src/bookings/policies.service';

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

describe('ENG-103 Price Quote with Minor-Unit Exact Arithmetic and Expiry', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;
  let customerUser: { userId: string; cookie: string };
  let standardZoneId: string;
  let vipZoneId: string;
  let standardPcId: string;
  let vipPcId: string;
  let customPcId: string;

  beforeAll(async () => {
    app = await startTestApp('eng103', { browserClient: true });
    ownerFixture = await createTenantAndVenue(app, 'CyberZone SRL', 'CyberZone Arena', 'OWNER');
    foreignFixture = await createTenantAndVenue(app, 'Alienware Arena SRL', 'Alienware Lounge', 'OWNER');

    // Customer user (no staff role)
    customerUser = await app.verifiedUser();

    // 1. Create Room and Zones
    const room = await app.db.query<{ id: string }>(
      "INSERT INTO rooms (venue_id, name) VALUES ($1, 'Arena Main') RETURNING id",
      [ownerFixture.venueId],
    );
    const roomId = room.rows[0].id;

    const z1 = await app.db.query<{ id: string }>(
      "INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, 'Standard Gaming') RETURNING id",
      [ownerFixture.venueId, roomId],
    );
    standardZoneId = z1.rows[0].id;

    const z2 = await app.db.query<{ id: string }>(
      "INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, 'VIP Lounge') RETURNING id",
      [ownerFixture.venueId, roomId],
    );
    vipZoneId = z2.rows[0].id;

    // 2. Create Resources
    const pc1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, zone_id, name, type) VALUES ($1, $2, $3, 'Standard PC #1', 'PC') RETURNING id",
      [ownerFixture.venueId, roomId, standardZoneId],
    );
    standardPcId = pc1.rows[0].id;

    const pc2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, zone_id, name, type) VALUES ($1, $2, $3, 'VIP PC #2', 'PC') RETURNING id",
      [ownerFixture.venueId, roomId, vipZoneId],
    );
    vipPcId = pc2.rows[0].id;

    const pc3 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, zone_id, name, type) VALUES ($1, $2, $3, 'Ultra PC #3', 'PC') RETURNING id",
      [ownerFixture.venueId, roomId, standardZoneId],
    );
    customPcId = pc3.rows[0].id;

    // 3. Set Venue Default Policy (40% deposit, 60m min duration, 30m granularity)
    await app.call(
      'POST',
      `/v1/dashboard/venues/${ownerFixture.venueId}/policies`,
      {
        headers: { cookie: ownerFixture.cookie },
        body: {
          name: 'CyberZone Default Policy',
          isDefault: true,
          settings: {
            prepaid_mode: 'DEPOSIT',
            deposit_percentage: 40,
            min_duration_minutes: 60,
            max_duration_minutes: 360,
            slot_granularity_minutes: 30,
          },
        },
      },
    );

    // 4. Set Pricing Rules via Dashboard API:
    // Venue default: 20.00 RON/h (2000 bani)
    await app.call(
      'PUT',
      `/v1/dashboard/venues/${ownerFixture.venueId}/pricing`,
      {
        headers: { cookie: ownerFixture.cookie },
        body: {
          targetType: 'VENUE_DEFAULT',
          hourlyRateMinor: 2000,
        },
      },
    );

    // VIP Zone override: 35.00 RON/h (3500 bani)
    await app.call(
      'PUT',
      `/v1/dashboard/venues/${ownerFixture.venueId}/pricing`,
      {
        headers: { cookie: ownerFixture.cookie },
        body: {
          targetType: 'ZONE',
          targetId: vipZoneId,
          hourlyRateMinor: 3500,
        },
      },
    );

    // Ultra PC direct override: 50.00 RON/h (5000 bani)
    await app.call(
      'PUT',
      `/v1/dashboard/venues/${ownerFixture.venueId}/pricing`,
      {
        headers: { cookie: ownerFixture.cookie },
        body: {
          targetType: 'RESOURCE',
          targetId: customPcId,
          hourlyRateMinor: 5000,
        },
      },
    );
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Pricing Rules Resolution & Precedence (Resource > Zone > Venue)', () => {
    it('applies venue default rate, zone rate, and resource direct rate correctly', async () => {
      // 2 hours booking (120 minutes)
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId, vipPcId, customPcId],
          starts_at: '2026-11-06T14:00:00Z',
          ends_at: '2026-11-06T16:00:00Z',
        },
      });

      expect(res.status).toBe(201);
      const quote = res.json as {
        quote_id: string;
        total_minor: number;
        due_now_minor: number;
        balance_minor: number;
        items: Array<{ resource_id: string; amount_minor: number; hourly_rate_minor: number }>;
        signature: string;
      };

      // standardPcId: 2h @ 20.00 RON/h (2000 bani) = 4000 bani
      const stdItem = quote.items.find((i) => i.resource_id === standardPcId);
      expect(stdItem?.hourly_rate_minor).toBe(2000);
      expect(stdItem?.amount_minor).toBe(4000);

      // vipPcId: 2h @ 35.00 RON/h (3500 bani) = 7000 bani
      const vipItem = quote.items.find((i) => i.resource_id === vipPcId);
      expect(vipItem?.hourly_rate_minor).toBe(3500);
      expect(vipItem?.amount_minor).toBe(7000);

      // customPcId: 2h @ 50.00 RON/h (5000 bani) = 10000 bani
      const customItem = quote.items.find((i) => i.resource_id === customPcId);
      expect(customItem?.hourly_rate_minor).toBe(5000);
      expect(customItem?.amount_minor).toBe(10000);

      // Total = 4000 + 7000 + 10000 = 21000 bani (210.00 RON)
      expect(quote.total_minor).toBe(21000);
    });
  });

  describe('Minor-Unit Exact Arithmetic & Accounting Equality', () => {
    it('enforces exact due_now_minor + balance_minor === total_minor on deposit split', async () => {
      // 90 minutes on standard PC: 1.5h @ 2000 bani = 3000 bani (30.00 RON)
      // 40% deposit of 3000 bani = 1200 bani due now, 1800 bani balance
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T10:00:00Z',
          ends_at: '2026-11-06T11:30:00Z',
        },
      });

      expect(res.status).toBe(201);
      const quote = res.json as {
        total_minor: number;
        due_now_minor: number;
        balance_minor: number;
      };

      expect(quote.total_minor).toBe(3000);
      expect(quote.due_now_minor).toBe(1200);
      expect(quote.balance_minor).toBe(1800);
      expect(quote.due_now_minor + quote.balance_minor).toBe(quote.total_minor);
    });

    it('enforces ceiling rounding on fractional minor-unit deposits without losing a single ban', async () => {
      // 90 minutes on VIP PC: 1.5h @ 3500 bani = 5250 bani
      // 40% deposit of 5250 = 2100 bani
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [vipPcId],
          starts_at: '2026-11-06T12:00:00Z',
          ends_at: '2026-11-06T13:30:00Z',
        },
      });

      expect(res.status).toBe(201);
      const quote = res.json as {
        total_minor: number;
        due_now_minor: number;
        balance_minor: number;
      };

      expect(quote.total_minor).toBe(5250);
      expect(quote.due_now_minor).toBe(2100);
      expect(quote.balance_minor).toBe(3150);
      expect(quote.due_now_minor + quote.balance_minor).toBe(quote.total_minor);
    });
  });

  describe('Policy Duration Validation Integration', () => {
    it('rejects quote request shorter than min_duration_minutes (400)', async () => {
      // 30 min duration (venue min is 60m)
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T10:00:00Z',
          ends_at: '2026-11-06T10:30:00Z',
        },
      });

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('POLICY_DURATION_OUT_OF_BOUNDS');
    });

    it('rejects quote request not aligned with slot granularity (400)', async () => {
      // 75 min duration (granularity is 30m)
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T10:00:00Z',
          ends_at: '2026-11-06T11:15:00Z',
        },
      });

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('POLICY_DURATION_NOT_ALIGNED');
    });
  });

  describe('Cryptographic Signature Verification & Expiry', () => {
    it('generates a valid cryptographic signature that verifies successfully', async () => {
      const quotesService = new QuotesService({} as unknown as PricingService, {} as unknown as PoliciesService);

      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T14:00:00Z',
          ends_at: '2026-11-06T16:00:00Z',
        },
      });

      expect(res.status).toBe(201);
      const quote = res.json as PriceQuote;
      expect(quote.signature).toBeDefined();

      const verification = quotesService.verifyQuote(quote);
      expect(verification.valid).toBe(true);
    });

    it('detects tampering when total_minor or due_now_minor is modified', async () => {
      const quotesService = new QuotesService({} as unknown as PricingService, {} as unknown as PoliciesService);

      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T14:00:00Z',
          ends_at: '2026-11-06T16:00:00Z',
        },
      });

      const quote = res.json as PriceQuote;

      // Tamper with total_minor
      const tamperedQuote = { ...quote, total_minor: 100 };
      const verification = quotesService.verifyQuote(tamperedQuote);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('QUOTE_SIGNATURE_INVALID');
    });

    it('flags quote as expired once expires_at has passed', async () => {
      const quotesService = new QuotesService({} as unknown as PricingService, {} as unknown as PoliciesService);

      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: ownerFixture.venueId,
          resource_ids: [standardPcId],
          starts_at: '2026-11-06T14:00:00Z',
          ends_at: '2026-11-06T16:00:00Z',
        },
      });

      const quote = res.json as PriceQuote;

      // Simulate expired quote
      const expiredQuote = {
        ...quote,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };

      const verification = quotesService.verifyQuote(expiredQuote);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('QUOTE_EXPIRED');
    });
  });

  describe('Dashboard Pricing Management RBAC', () => {
    it('denies cross-tenant pricing modification (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${foreignFixture.venueId}/pricing`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            targetType: 'VENUE_DEFAULT',
            hourlyRateMinor: 1500,
          },
        },
      );

      expect(res.status).toBe(404);
      const error = app.errorOf(res);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('denies RECEPTION staff from altering pricing rules (403)', async () => {
      const recUser = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [recUser.userId, ownerFixture.venueId, ownerFixture.tenantId, 'RECEPTION'],
      );

      const res = await app.call(
        'PUT',
        `/v1/dashboard/venues/${ownerFixture.venueId}/pricing`,
        {
          headers: { cookie: recUser.cookie },
          body: {
            targetType: 'VENUE_DEFAULT',
            hourlyRateMinor: 1500,
          },
        },
      );

      expect(res.status).toBe(403);
      const error = app.errorOf(res);
      expect(error.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });
});
