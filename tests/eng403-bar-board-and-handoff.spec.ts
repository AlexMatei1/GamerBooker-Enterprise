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

  // Reception / Bar staff
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

describe('ENG-403 Bar Board State Machine & Order Handoff Station/Pickup', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };

  let pcId: string;
  let activeBookingId: string;
  let burgerProductId: string;
  let energyDrinkProductId: string;

  beforeAll(async () => {
    app = await startTestApp('eng403');
    fixtures = await createVenueWithRoles(app, 'Cyber Bar SRL', 'Cyber Bar Timisoara');
    otherVenueFixtures = await createVenueWithRoles(app, 'Other SRL', 'Other Bar Oradea');
    customerUser = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Arena Station Room'],
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

    // 2. Create products
    const p1 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Cyber Bacon Burger',
          sku: 'FOOD-BURGER-01',
          price_minor: 3500,
          initial_stock: 15,
          inventory_tracking: true,
          preparation_minutes: 15,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
        },
      },
    );
    burgerProductId = (p1.json as any).id;

    const p2 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Red Bull Energy 250ml',
          sku: 'DRK-REDBULL-01',
          price_minor: 1400,
          initial_stock: 25,
          inventory_tracking: true,
          restricted_product_type: 'ENERGY_DRINK',
          preparation_minutes: 2,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
        },
      },
    );
    energyDrinkProductId = (p2.json as any).id;

    // 3. Create active in-session checked-in booking
    const start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 90 * 60 * 1000).toISOString();

    const qRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: customerUser.cookie },
      body: {
        venue_id: fixtures.venueId,
        resource_ids: [pcId],
        starts_at: start,
        ends_at: end,
      },
    });
    const quote = qRes.json as any;

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: customerUser.cookie },
      body: { quote_id: quote.quote_id },
    });
    const hold = holdRes.json as any;

    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: customerUser.cookie },
      body: { hold_id: hold.id },
    });
    const booking = (confirmRes.json as any).booking || (confirmRes.json as any);
    activeBookingId = booking.id;

    await app.db.query("UPDATE bookings SET status = 'CHECKED_IN' WHERE id = $1", [activeBookingId]);
  });

  afterAll(async () => {
    await app.stop();
  });

  // Helper to place and capture an order
  async function placeAndCaptureOrder(options: {
    fulfillmentMode: 'AT_STATION' | 'BAR_PICKUP';
    items: Array<{ product_id: string; quantity: number }>;
  }) {
    const checkRes = await app.call('POST', '/v1/orders/checkout', {
      headers: { cookie: customerUser.cookie },
      body: {
        venue_id: fixtures.venueId,
        booking_id: activeBookingId,
        fulfillment_mode: options.fulfillmentMode,
        target_resource_id: options.fulfillmentMode === 'AT_STATION' ? pcId : undefined,
        items: options.items,
      },
    });
    expect(checkRes.status).toBe(201);
    const checkout = checkRes.json as any;

    // Capture payment
    const capRes = await app.call('POST', '/v1/orders/payments/capture', {
      body: { provider_ref: checkout.provider_ref },
    });
    expect(capRes.status).toBe(200);

    return checkout;
  }

  // ===========================================================================
  // 1. Bar Board Queue & Metric Summaries
  // ===========================================================================
  describe('Bar Board Queue View', () => {
    it('returns active orders queue partitioned by state with metrics and SLA calculation', async () => {
      // Place an order
      const o1 = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: burgerProductId, quantity: 1 }],
      });

      // Staff queries bar board
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/bar-board`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.queue.length).toBeGreaterThanOrEqual(1);
      expect(data.placed_count).toBeGreaterThanOrEqual(1);

      const targetOrder = data.queue.find((o: any) => o.id === o1.order_id);
      expect(targetOrder).toBeDefined();
      expect(targetOrder.status).toBe('PLACED');
      expect(targetOrder.pickup_code).toMatch(/^PK-[0-9A-Z]{4}$/);
      expect(targetOrder.sla_status).toBe('ON_TIME');
      expect(targetOrder.age_minutes).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. State Machine Transitions (PLACED -> ACCEPTED -> PREPARING -> READY)
  // ===========================================================================
  describe('Order State Machine Lifecycle', () => {
    let orderId: string;

    beforeAll(async () => {
      const o = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: burgerProductId, quantity: 1 }],
      });
      orderId = o.order_id;
    });

    it('transitions PLACED -> ACCEPTED and records staff audit', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/accept`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const order = res.json as any;
      expect(order.status).toBe('ACCEPTED');
      expect(order.accepted_by).toBe(fixtures.reception.userId);
      expect(order.accepted_at).toBeDefined();
    });

    it('rejects accept when order is not in PLACED status (400 INVALID_ORDER_STATE)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/accept`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_ORDER_STATE');
    });

    it('transitions ACCEPTED -> PREPARING and records preparing_by staff', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/prepare`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const order = res.json as any;
      expect(order.status).toBe('PREPARING');
      expect(order.prepared_by).toBe(fixtures.manager.userId);
      expect(order.prepared_at).toBeDefined();
    });

    it('transitions PREPARING -> READY and records ready_at', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/ready`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const order = res.json as any;
      expect(order.status).toBe('READY');
      expect(order.ready_at).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. Counter Handoff & Pickup Code Verification (BAR_PICKUP)
  // ===========================================================================
  describe('Counter Handoff & Pickup Code Verification', () => {
    let orderResult: any;

    beforeAll(async () => {
      orderResult = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: burgerProductId, quantity: 2 }],
      });

      // Advance to READY
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/accept`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/prepare`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/ready`, {
        headers: { cookie: fixtures.reception.cookie },
      });
    });

    it('rejects handoff when pickup code is incorrect (400 INVALID_PICKUP_CODE)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { pickup_code: 'PK-WRONG' },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_PICKUP_CODE');
    });

    it('completes handoff with valid pickup code and deducts on-hand & reserved stock', async () => {
      // Check stock before handoff
      const pBefore = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const onHandBefore = (pBefore.json as any).stock_on_hand;
      const reservedBefore = (pBefore.json as any).stock_reserved;

      // Handoff with correct pickup code
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { pickup_code: orderResult.pickup_code },
        },
      );

      expect(res.status).toBe(200);
      const handedOff = res.json as any;
      expect(handedOff.status).toBe('HANDED_OFF');
      expect(handedOff.handed_off_by).toBe(fixtures.reception.userId);

      // Verify stock was deducted: both on-hand and reserved decreased by 2
      const pAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((pAfter.json as any).stock_on_hand).toBe(onHandBefore - 2);
      expect((pAfter.json as any).stock_reserved).toBe(reservedBefore - 2);

      // Verify stock movement ledger recorded ORDER_DEDUCT
      const historyRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}/stock-history`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const history = historyRes.json as any[];
      expect(history[0].movement_type).toBe('ORDER_DEDUCT');
      expect(history[0].quantity_delta).toBe(-2);

      // Repeated handoff call is idempotent and does NOT duplicate stock deduction
      const replayRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { pickup_code: orderResult.pickup_code },
        },
      );
      expect(replayRes.status).toBe(200);
      const pReplay = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((pReplay.json as any).stock_on_hand).toBe(onHandBefore - 2);
    });
  });

  // ===========================================================================
  // 4. Station Handoff & Age Verification Enforcement (Law 42/2024)
  // ===========================================================================
  describe('Station Handoff & Age Verification Enforcement (Law 42/2024)', () => {
    let orderResult: any;

    beforeAll(async () => {
      orderResult = await placeAndCaptureOrder({
        fulfillmentMode: 'AT_STATION',
        items: [{ product_id: energyDrinkProductId, quantity: 1 }],
      });

      // Advance to READY
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/accept`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/prepare`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/ready`, {
        headers: { cookie: fixtures.reception.cookie },
      });
    });

    it('rejects handoff of age-restricted items without staff age verification (400 AGE_VERIFICATION_REQUIRED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { age_verified: false },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('AGE_VERIFICATION_REQUIRED');
    });

    it('completes station handoff with age verification and records staff audit', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderResult.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { age_verified: true },
        },
      );

      expect(res.status).toBe(200);
      const handedOff = res.json as any;
      expect(handedOff.status).toBe('HANDED_OFF');
      expect(handedOff.age_verified_by).toBe(fixtures.reception.userId);
      expect(handedOff.age_verified_at).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. Order Rejection & Automatic Compensating Refund
  // ===========================================================================
  describe('Order Rejection & Automatic Compensating Refund', () => {
    it('allows staff to reject an order, releasing reserved stock and initiating compensating refund', async () => {
      // Check stock before placing order
      const pBefore = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const reservedBefore = (pBefore.json as any).stock_reserved;

      // Place and capture order
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: burgerProductId, quantity: 2 }],
      });

      // Staff rejects order (e.g. kitchen fryer broken)
      const rejRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/reject`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'Kitchen fryer maintenance breakdown' },
        },
      );

      expect(rejRes.status).toBe(200);
      const rejectedOrder = rejRes.json as any;
      expect(rejectedOrder.status).toBe('CANCELLED');
      expect(rejectedOrder.cancellation_reason).toBe('Kitchen fryer maintenance breakdown');

      // Verify reserved stock was released back to pool
      const pAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((pAfter.json as any).stock_reserved).toBe(reservedBefore);

      // Verify refund record was created in refunds table
      const refCheck = await app.db.query(
        'SELECT * FROM refunds WHERE payment_intent_id = $1',
        [order.payment_intent_id],
      );
      expect(refCheck.rows.length).toBeGreaterThanOrEqual(1);
      expect(Number(refCheck.rows[0].amount_minor)).toBe(Number(order.total_minor));
    });
  });

  // ===========================================================================
  // 6. Authorization & Boundaries
  // ===========================================================================
  describe('Authorization & Security Boundaries', () => {
    it('prohibits customer from accessing bar board (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/bar-board`,
        {
          headers: { cookie: customerUser.cookie },
        },
      );
      expect([403, 404]).toContain(res.status);
    });

    it('enforces cross-venue boundary: Venue B staff cannot access Venue A bar board', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/bar-board`,
        {
          headers: { cookie: otherVenueFixtures.owner.cookie },
        },
      );
      expect([403, 404]).toContain(res.status);
    });
  });
});
