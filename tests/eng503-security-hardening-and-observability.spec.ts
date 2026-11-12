import { TestApp, startTestApp } from './support/auth-harness';

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
  const recUser = await app.verifiedUser();
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [recUser.userId, venueId, tenantId, 'RECEPTION'],
  );

  return {
    owner: { ...ownerUser, tenantId, venueId },
    manager: { ...managerUser, tenantId, venueId },
    reception: { ...recUser, tenantId, venueId },
    venueId,
    tenantId,
  };
}

describe('ENG-503 Security Hardening, BOLA/PenTest, and Observability Dashboards', () => {
  let app: TestApp;
  let venueA: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let venueB: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customerA: { userId: string; cookie: string };
  let customerB: { userId: string; cookie: string };
  let pcAId: string;
  let bookingAId: string;
  let orderAId: string;

  beforeAll(async () => {
    app = await startTestApp('eng503', { browserClient: true });
    venueA = await createVenueWithRoles(app, 'Fortress Gaming SRL', 'Fortress Arena Bucharest');
    venueB = await createVenueWithRoles(app, 'Rival Club SRL', 'Rival Gaming Cluj');

    customerA = await app.verifiedUser();
    customerB = await app.verifiedUser();

    // Venue A policies & price rules
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "FULL", "deposit_percentage": 100, "allow_online_remaining": true, "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [venueA.venueId],
    );
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency)
       VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')`,
      [venueA.venueId],
    );

    // Venue A room & resource
    const roomRes = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [venueA.venueId, 'Arena 1'],
    );
    const roomId = roomRes.rows[0].id;

    const pcRes = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'PC-FORTRESS-01', 'AVAILABLE', true) RETURNING id`,
      [venueA.venueId, roomId],
    );
    pcAId = pcRes.rows[0].id;

    // Create confirmed booking for Customer A
    const startsAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 50 * 3600 * 1000).toISOString();

    const quoteRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: customerA.cookie },
      body: {
        venue_id: venueA.venueId,
        resource_ids: [pcAId],
        starts_at: startsAt,
        ends_at: endsAt,
      },
    });
    const quote = quoteRes.json as any;

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: customerA.cookie },
      body: { quote_id: quote.quote_id },
    });
    const hold = holdRes.json as any;

    // The confirm guard requires server-side proof of the upfront charge; the
    // fixture settles the hold the way the PSP webhook would.
    const upfrontIntentId = await app.settleHoldPayment(hold.id);
    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: customerA.cookie },
      body: {
        hold_id: hold.id,
        ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
      },
    });
    const confirmed = confirmRes.json as any;
    bookingAId = confirmed.booking?.id || confirmed.id;

    // Create order for Customer A
    const catRes = await app.db.query<{ id: string }>(
      `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
       VALUES ($1, $2, 'Drinks', true) RETURNING id`,
      [venueA.tenantId, venueA.venueId],
    );
    const prodRes = await app.db.query<{ id: string }>(
      `INSERT INTO products (tenant_id, venue_id, category_id, sku, title, price_minor, currency, stock_on_hand, active)
       VALUES ($1, $2, $3, 'SEC-SODA', 'Club Mate', 1500, 'RON', 20, true) RETURNING id`,
      [venueA.tenantId, venueA.venueId, catRes.rows[0].id],
    );

    const ordRes = await app.db.query<{ id: string }>(
      `INSERT INTO orders (
         tenant_id, venue_id, booking_id, customer_id, public_code, pickup_code,
         order_type, fulfillment_mode, status, total_minor, currency
       )
       VALUES ($1, $2, $3, $4, 'ORD-SEC-01', 'PK-SEC', 'IN_SESSION', 'BAR_PICKUP', 'PLACED', 1500, 'RON')
       RETURNING id`,
      [venueA.tenantId, venueA.venueId, bookingAId, customerA.userId],
    );
    orderAId = ordRes.rows[0].id;
    await app.db.query(
      `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price_minor, line_total_minor)
       VALUES ($1, $2, 'Club Mate', 1, 1500, 1500)`,
      [orderAId, prodRes.rows[0].id],
    );
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('OWASP Recommended Security Headers', () => {
    it('sets strict security headers across API responses', async () => {
      const res = await app.call('GET', '/healthz');
      expect(res.status).toBe(200);

      const headers = res.headers;
      expect(headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('x-frame-options')).toBe('DENY');
      expect(headers.get('strict-transport-security')).toContain('max-age=31536000');
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(headers.get('x-permitted-cross-domain-policies')).toBe('none');
      expect(headers.get('x-xss-protection')).toBe('0');
    });
  });

  describe('BOLA (Broken Object Level Authorization) PenTest Suite', () => {
    it('prohibits Customer B from viewing Customer A booking (404/403 anti-enumeration)', async () => {
      const res = await app.call('GET', `/v1/bookings/${bookingAId}`, {
        headers: { cookie: customerB.cookie },
      });
      // Invariant: Returns 404/403 to prevent object existence enumeration
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits Customer B from viewing Customer A rolling QR token', async () => {
      const res = await app.call('GET', `/v1/bookings/${bookingAId}/qr`, {
        headers: { cookie: customerB.cookie },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits Customer B from cancelling Customer A booking', async () => {
      const res = await app.call('POST', `/v1/bookings/${bookingAId}/cancel`, {
        headers: { cookie: customerB.cookie },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits Customer B from reading Customer A booking receipt', async () => {
      const res = await app.call('GET', `/v1/bookings/${bookingAId}/receipt`, {
        headers: { cookie: customerB.cookie },
      });
      expect(res.status).toBe(404);
    });

    it('prohibits Customer B from reading Customer A consumables order status flow', async () => {
      const res = await app.call('GET', `/v1/orders/${orderAId}/status-flow`, {
        headers: { cookie: customerB.cookie },
      });
      expect(res.status).toBe(404);
    });

    it('enforces cross-venue boundary: Venue B staff cannot access Venue A bar board queue', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${venueA.venueId}/bar-board`, {
        headers: { cookie: venueB.manager.cookie },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('enforces cross-venue boundary: Venue B staff cannot access Venue A live floor', async () => {
      const res = await app.call('GET', `/v1/dashboard/venues/${venueA.venueId}/live-floor`, {
        headers: { cookie: venueB.manager.cookie },
      });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('BOPLA / Price & Settlement Tampering Immunity', () => {
    it('ignores client attempts to alter pricing total on quote generation', async () => {
      const startsAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 74 * 3600 * 1000).toISOString();

      // Client attempts mass-assignment to set 1 ban price
      const quoteRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customerA.cookie },
        body: {
          venue_id: venueA.venueId,
          resource_ids: [pcAId],
          starts_at: startsAt,
          ends_at: endsAt,
          total_minor: 1, // Tamper attempt
          due_now_minor: 1,
        },
      });

      expect(quoteRes.status).toBe(201);
      const quote = quoteRes.json as any;
      // Server overrides client input with honest server-calculated hourly rate (2 hours = 6000 bani)
      expect(quote.total_minor).toBe(6000);
      expect(quote.due_now_minor).toBe(6000);
      expect(quote.signature).toBeTruthy();
    });
  });

  describe('Security Violation Logging & Observability Metrics', () => {
    // HANDOFF-CAFE-ACCESS-2026-11-05.md line 29 deliberately closes the legacy
    // observability routes (security metrics, security-violation capture and
    // system health) as a compatibility change, because their contracts were not
    // tenant-safe. Basic /healthz and /readyz stay available. These assertions pin
    // the closure so an accidental re-opening is caught by CI rather than in prod.
    it('fails closed on the legacy security-violation capture route', async () => {
      const logRes = await app.call('POST', '/v1/observability/security-violations', {
        headers: { cookie: venueA.owner.cookie },
        body: {
          violationType: 'BOLA_UNAUTHORIZED_OBJECT_ACCESS',
          targetType: 'BOOKING',
          targetId: bookingAId,
          endpoint: `/v1/bookings/${bookingAId}`,
          metadata: { attempted_by: customerB.userId },
        },
      });
      expect(logRes.status).toBe(404);
      expect(app.errorOf(logRes).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('fails closed on the legacy security-metrics dashboard route', async () => {
      const metricsRes = await app.call('GET', '/v1/observability/security-metrics', {
        headers: { cookie: venueA.owner.cookie },
      });
      expect(metricsRes.status).toBe(404);
      expect(app.errorOf(metricsRes).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('fails closed on the legacy system-health overview route', async () => {
      // Unauthenticated callers are stopped by SessionGuard first.
      const anonRes = await app.call('GET', '/v1/observability/system-health');
      expect(anonRes.status).toBe(401);

      // An authenticated caller then hits the explicit closure.
      const healthRes = await app.call('GET', '/v1/observability/system-health', {
        headers: { cookie: venueA.owner.cookie },
      });
      expect(healthRes.status).toBe(404);
      expect(app.errorOf(healthRes).code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
