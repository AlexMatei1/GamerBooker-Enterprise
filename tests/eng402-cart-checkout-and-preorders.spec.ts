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

describe('ENG-402 Cart, Checkout, Preorders & In-Session Order Eligibility', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };
  let otherCustomer: { cookie: string; userId: string };

  let pcId: string;
  let otherPcId: string;
  let confirmedFutureBookingId: string;
  let checkedInBookingId: string;
  let pizzaProductId: string;
  let energyDrinkProductId: string;

  let bookingOffsetHours = 50;

  beforeAll(async () => {
    app = await startTestApp('eng402');
    fixtures = await createVenueWithRoles(app, 'Cyber Cafe SRL', 'Cyber Arena Cluj');
    otherVenueFixtures = await createVenueWithRoles(app, 'Other SRL', 'Other Arena Brasov');
    customerUser = await app.verifiedUser();
    otherCustomer = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Arena Battle Room'],
    );
    const roomId = r1.rows[0].id;

    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "FULL", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 5000, 'RON')",
      [fixtures.venueId],
    );

    const res1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'STATION-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pcId = res1.rows[0].id;

    const res2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'STATION-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    otherPcId = res2.rows[0].id;

    // 2. Create products
    const prod1 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Margherita Pizza 400g',
          sku: 'FOOD-PIZZA-MARG',
          price_minor: 3200,
          initial_stock: 10,
          max_qty: 20,
          inventory_tracking: true,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
        },
      },
    );
    pizzaProductId = (prod1.json as any).id;

    const prod2 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Monster Energy 500ml',
          sku: 'DRK-MONSTER-500',
          price_minor: 1500,
          initial_stock: 20,
          inventory_tracking: true,
          restricted_product_type: 'ENERGY_DRINK',
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
        },
      },
    );
    energyDrinkProductId = (prod2.json as any).id;

    // 3. Create confirmed future booking (Preorder eligible)
    confirmedFutureBookingId = await createBooking(customerUser.cookie, 24); // 24 hours in future

    // 4. Create checked-in booking (In-Session eligible)
    checkedInBookingId = await createBooking(customerUser.cookie, 1);
    await app.db.query("UPDATE bookings SET status = 'CHECKED_IN' WHERE id = $1", [checkedInBookingId]);
  });

  afterAll(async () => {
    await app.stop();
  });

  async function createBooking(cookie: string, offsetHours: number): Promise<string> {
    bookingOffsetHours += 10;
    const start = new Date(Date.now() + offsetHours * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + (offsetHours + 2) * 3600 * 1000).toISOString();

    const qRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie },
      body: {
        venue_id: fixtures.venueId,
        resource_ids: [pcId],
        starts_at: start,
        ends_at: end,
      },
    });
    const quote = qRes.json as any;

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie },
      body: { quote_id: quote.quote_id },
    });
    const hold = holdRes.json as any;

    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie },
      body: { hold_id: hold.id },
    });
    const booking = (confirmRes.json as any).booking || (confirmRes.json as any);
    return booking.id;
  }

  // ===========================================================================
  // 1. Cart Validation & Eligibility Rules
  // ===========================================================================
  describe('Cart Validation & Session Eligibility (Reservation-First)', () => {
    it('classifies future confirmed booking order as PREORDER and calculates line totals', async () => {
      const res = await app.call('POST', '/v1/orders/cart/validate', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: confirmedFutureBookingId,
          fulfillment_mode: 'BAR_PICKUP',
          items: [
            { product_id: pizzaProductId, quantity: 2 },
            { product_id: energyDrinkProductId, quantity: 1 },
          ],
        },
      });

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.valid).toBe(true);
      expect(data.order_type).toBe('PREORDER');
      expect(data.total_minor).toBe(2 * 3200 + 1 * 1500); // 7900
      expect(data.has_age_restricted_items).toBe(true); // energy drink present
      expect(data.items.length).toBe(2);
    });

    it('classifies checked-in booking as IN_SESSION and validates AT_STATION target resource', async () => {
      const res = await app.call('POST', '/v1/orders/cart/validate', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: checkedInBookingId,
          fulfillment_mode: 'AT_STATION',
          target_resource_id: pcId, // Assigned to booking
          items: [{ product_id: pizzaProductId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.valid).toBe(true);
      expect(data.order_type).toBe('IN_SESSION');
      expect(data.total_minor).toBe(3200);
    });

    it('rejects AT_STATION fulfillment when target station is not assigned to booking', async () => {
      const res = await app.call('POST', '/v1/orders/cart/validate', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: checkedInBookingId,
          fulfillment_mode: 'AT_STATION',
          target_resource_id: otherPcId, // Not in booking's resource_ids
          items: [{ product_id: pizzaProductId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.valid).toBe(false);
      expect(data.errors.some((e: string) => e.includes('not assigned to this booking'))).toBe(true);
    });

    it('prohibits another customer from ordering on a booking they do not own (403 FORBIDDEN_BOOKING_ACCESS)', async () => {
      const res = await app.call('POST', '/v1/orders/cart/validate', {
        headers: { cookie: otherCustomer.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: confirmedFutureBookingId,
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: pizzaProductId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('FORBIDDEN_BOOKING_ACCESS');
    });

    it('rejects ordering when cart quantity exceeds available stock', async () => {
      const res = await app.call('POST', '/v1/orders/cart/validate', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: confirmedFutureBookingId,
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: pizzaProductId, quantity: 15 }], // Exceeds stock (10)
        },
      });

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.valid).toBe(false);
      expect(data.errors.some((e: string) => e.includes('Insufficient stock'))).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Order Checkout & Atomic Stock Reservation
  // ===========================================================================
  describe('Order Checkout & Atomic Stock Reservation', () => {
    let orderResult: any;

    it('places order, generates pickup code for BAR_PICKUP, reserves stock, and creates PSP intent', async () => {
      // Check pizza stock before checkout
      const pBefore = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${pizzaProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const reservedBefore = (pBefore.json as any).stock_reserved;

      const res = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: confirmedFutureBookingId,
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: pizzaProductId, quantity: 2 }],
        },
      });

      expect(res.status).toBe(201);
      orderResult = res.json as any;
      expect(orderResult.order_id).toBeDefined();
      expect(orderResult.public_code).toMatch(/^ORD-[0-9A-Z]{6}$/);
      expect(orderResult.pickup_code).toMatch(/^PK-[0-9A-Z]{4}$/);
      expect(orderResult.status).toBe('PAYMENT_PENDING');
      expect(orderResult.order_type).toBe('PREORDER');
      expect(orderResult.total_minor).toBe(6400); // 2 * 3200
      expect(orderResult.provider_ref).toBeDefined();

      // Verify stock reservation was updated
      const pAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${pizzaProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((pAfter.json as any).stock_reserved).toBe(reservedBefore + 2);
    });

    it('captures order payment webhook and transitions order status to PLACED', async () => {
      const capRes = await app.call('POST', '/v1/orders/payments/capture', {
        body: { provider_ref: orderResult.provider_ref },
      });

      expect(capRes.status).toBe(200);
      const placedOrder = capRes.json as any;
      expect(placedOrder.id).toBe(orderResult.order_id);
      expect(placedOrder.status).toBe('PLACED');

      // Replay is idempotent
      const replayRes = await app.call('POST', '/v1/orders/payments/capture', {
        body: { provider_ref: orderResult.provider_ref },
      });
      expect(replayRes.status).toBe(200);
      expect((replayRes.json as any).status).toBe('PLACED');
    });
  });

  // ===========================================================================
  // 3. Order Cancellation & Stock Release
  // ===========================================================================
  describe('Order Cancellation & Stock Release', () => {
    it('cancels pending order and atomically releases reserved stock back to pool', async () => {
      // 1. Create a new checkout
      const checkRes = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customerUser.cookie },
        body: {
          venue_id: fixtures.venueId,
          booking_id: checkedInBookingId,
          fulfillment_mode: 'AT_STATION',
          target_resource_id: pcId,
          items: [{ product_id: energyDrinkProductId, quantity: 3 }],
        },
      });
      expect(checkRes.status).toBe(201);
      const pendingOrder = checkRes.json as any;

      // Check reserved stock increased by 3
      const p1 = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const reservedMid = (p1.json as any).stock_reserved;

      // 2. Customer cancels the pending order
      const cancelRes = await app.call(
        'POST',
        `/v1/orders/${pendingOrder.order_id}/cancel`,
        {
          headers: { cookie: customerUser.cookie },
          body: { reason: 'Changed mind before payment' },
        },
      );
      expect(cancelRes.status).toBe(200);
      const cancelledOrder = cancelRes.json as any;
      expect(cancelledOrder.status).toBe('CANCELLED');
      expect(cancelledOrder.cancellation_reason).toBe('Changed mind before payment');

      // 3. Verify stock_reserved was released (decreased by 3)
      const p2 = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((p2.json as any).stock_reserved).toBe(reservedMid - 3);

      // Verify stock movement ledger recorded RESERVATION_RELEASE
      const historyRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}/stock-history`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const history = historyRes.json as any[];
      expect(history[0].movement_type).toBe('RESERVATION_RELEASE');
      expect(history[0].quantity_delta).toBe(-3);
    });
  });

  // ===========================================================================
  // 4. Queries & Authorization Boundaries
  // ===========================================================================
  describe('Queries & Security Boundaries', () => {
    it('allows customer to list their own orders', async () => {
      const res = await app.call('GET', '/v1/orders', {
        headers: { cookie: customerUser.cookie },
      });
      expect(res.status).toBe(200);
      const orders = res.json as any[];
      expect(orders.length).toBeGreaterThanOrEqual(1);
      expect(orders[0].customer_id).toBe(customerUser.userId);
    });

    it('allows venue staff to list venue orders with revenue summary metrics', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.orders.length).toBeGreaterThanOrEqual(1);
      expect(data.total_count).toBeGreaterThanOrEqual(1);
      expect(data.summary.total_revenue_minor).toBeGreaterThan(0);
    });

    it('prohibits customer from accessing another customer order (403 FORBIDDEN)', async () => {
      // Customer orders
      const myOrders = await app.call('GET', '/v1/orders', {
        headers: { cookie: customerUser.cookie },
      });
      const orderId = (myOrders.json as any[])[0].id;

      // Other customer attempts access
      const res = await app.call('GET', `/v1/orders/${orderId}`, {
        headers: { cookie: otherCustomer.cookie },
      });
      expect(res.status).toBe(403);
    });

    it('enforces cross-venue boundary: Venue B staff cannot access Venue A orders', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders`,
        {
          headers: { cookie: otherVenueFixtures.owner.cookie },
        },
      );
      expect([403, 404]).toContain(res.status);
    });
  });
});
