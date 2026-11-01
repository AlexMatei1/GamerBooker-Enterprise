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

describe('ENG-404 Age Restrictions Refusal, Unavailable Item Refunds & Stock Reconciliation', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; manager: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };

  let pcId: string;
  let activeBookingId: string;
  let burgerProductId: string;
  let energyDrinkProductId: string;
  let pizzaProductId: string;

  beforeAll(async () => {
    app = await startTestApp('eng404');
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
          initial_stock: 20,
          inventory_tracking: true,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
          restricted_product_type: 'NONE',
          age_verification_required: false,
        },
      },
    );
    expect(p1.status).toBe(201);
    burgerProductId = (p1.json as any).id;

    const p2 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Monster Energy Drink 500ml',
          sku: 'DRINK-ENERGY-01',
          price_minor: 1500,
          initial_stock: 50,
          inventory_tracking: true,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
          restricted_product_type: 'ENERGY_DRINK',
          age_verification_required: true,
        },
      },
    );
    expect(p2.status).toBe(201);
    energyDrinkProductId = (p2.json as any).id;

    const p3 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Pepperoni Pizza',
          sku: 'FOOD-PIZZA-01',
          price_minor: 4200,
          initial_stock: 10,
          inventory_tracking: true,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
          restricted_product_type: 'NONE',
          age_verification_required: false,
        },
      },
    );
    expect(p3.status).toBe(201);
    pizzaProductId = (p3.json as any).id;

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

    const capRes = await app.call('POST', '/v1/orders/payments/capture', {
      body: { provider_ref: checkout.provider_ref },
    });
    expect(capRes.status).toBe(200);

    return checkout;
  }

  // ===========================================================================
  // 1. Law 42/2024 Age Refusal & Partial Item Cancellation
  // ===========================================================================
  describe('Law 42/2024 Age Verification Refusal Flow', () => {
    it('refuses age-restricted item from multi-item order, releases stock, refunds item, and leaves unrestricted item active', async () => {
      // Check stock before checkout
      const pEnergyBefore = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const energyReservedBefore = (pEnergyBefore.json as any).stock_reserved;

      // Order with 1 Energy Drink (restricted) + 1 Burger (unrestricted)
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [
          { product_id: energyDrinkProductId, quantity: 1 },
          { product_id: burgerProductId, quantity: 1 },
        ],
      });

      // Staff inspects order
      const orderDetailRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const detail = orderDetailRes.json as any;
      const energyItem = detail.items.find((i: any) => i.product_id === energyDrinkProductId);
      const burgerItem = detail.items.find((i: any) => i.product_id === burgerProductId);

      expect(energyItem.status).toBe('ACTIVE');
      expect(energyItem.age_verification_required).toBe(true);
      expect(burgerItem.status).toBe('ACTIVE');

      // Customer fails age verification at counter. Staff calls refuse-age on the order.
      const refuseRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/refuse-age`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            reason: 'Customer appears underage and refused to present legal ID',
            line_item_ids: [energyItem.id],
          },
        },
      );

      expect(refuseRes.status).toBe(200);
      const updatedOrder = refuseRes.json as any;

      // Energy item is now refused with refund details
      const updatedEnergyItem = updatedOrder.items.find((i: any) => i.id === energyItem.id);
      expect(updatedEnergyItem.status).toBe('REFUSED_AGE_RESTRICTION');
      expect(updatedEnergyItem.refunded_amount_minor).toBe(1500);
      expect(updatedEnergyItem.refund_id).toBeTruthy();
      expect(updatedEnergyItem.refund_reason).toContain('underage');

      // Burger item remains ACTIVE
      const updatedBurgerItem = updatedOrder.items.find((i: any) => i.id === burgerItem.id);
      expect(updatedBurgerItem.status).toBe('ACTIVE');

      // Order remains in active state (not cancelled)
      expect(updatedOrder.status).toBe('PLACED');

      // Verify reserved stock was released for Energy Drink
      const pEnergyAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect((pEnergyAfter.json as any).stock_reserved).toBe(energyReservedBefore);

      // Now staff accepts, marks ready, and hands off the order
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/accept`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/prepare`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/ready`, {
        headers: { cookie: fixtures.reception.cookie },
      });

      // Handoff succeeds WITHOUT age verification because only burger remains active!
      const handoffRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            pickup_code: order.pickup_code,
            age_verified: false, // Not required anymore!
          },
        },
      );

      expect(handoffRes.status).toBe(200);
      expect((handoffRes.json as any).status).toBe('HANDED_OFF');
    });

    it('rejects attempt to refuse non-age-restricted line item (400 ITEM_NOT_AGE_RESTRICTED)', async () => {
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: burgerProductId, quantity: 1 }],
      });

      const detailRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const burgerItem = (detailRes.json as any).items[0];

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/refuse-age`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { line_item_ids: [burgerItem.id] },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('ITEM_NOT_AGE_RESTRICTED');
    });

    it('automatically cancels the entire order if all items in the order are age-refused', async () => {
      // Order with only Energy Drink
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'BAR_PICKUP',
        items: [{ product_id: energyDrinkProductId, quantity: 2 }],
      });

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/refuse-age`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'No physical ID document available' },
        },
      );

      expect(res.status).toBe(200);
      const cancelledOrder = res.json as any;
      expect(cancelledOrder.status).toBe('CANCELLED');
      expect(cancelledOrder.cancellation_reason).toContain('Age verification failed');
    });
  });

  // ===========================================================================
  // 2. Line Item Cancellation for Unavailable Products & Compensating Refunds
  // ===========================================================================
  describe('Line Item Cancellation for Unavailable Products', () => {
    it('cancels specific item when product is unavailable, releases reserved stock and issues compensating refund', async () => {
      // Order with 1 Pizza + 1 Energy Drink
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'AT_STATION',
        items: [
          { product_id: pizzaProductId, quantity: 1 },
          { product_id: energyDrinkProductId, quantity: 1 },
        ],
      });

      const detailRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const pizzaItem = (detailRes.json as any).items.find((i: any) => i.product_id === pizzaProductId);

      // Staff cancels pizza item due to kitchen outage
      const cancelRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/items/${pizzaItem.id}/cancel-unavailable`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'Pizza dough ran out, waiting for supplier delivery' },
        },
      );

      expect(cancelRes.status).toBe(200);
      const updatedOrder = cancelRes.json as any;

      const updatedPizza = updatedOrder.items.find((i: any) => i.id === pizzaItem.id);
      expect(updatedPizza.status).toBe('REFUNDED_UNAVAILABLE');
      expect(updatedPizza.refunded_amount_minor).toBe(4200);
      expect(updatedPizza.refund_id).toBeTruthy();
      expect(updatedPizza.refund_reason).toContain('Pizza dough ran out');

      // Order remains active for remaining Energy Drink
      expect(updatedOrder.status).toBe('PLACED');
    });

    it('rejects duplicate cancellation of already cancelled line item (400 ITEM_ALREADY_CANCELLED)', async () => {
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'AT_STATION',
        items: [
          { product_id: pizzaProductId, quantity: 1 },
          { product_id: burgerProductId, quantity: 1 },
        ],
      });

      const detailRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const pizzaItem = (detailRes.json as any).items.find((i: any) => i.product_id === pizzaProductId);

      // First cancellation
      await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/items/${pizzaItem.id}/cancel-unavailable`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'First cancel reason' },
        },
      );

      // Second duplicate cancellation
      const dupRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/items/${pizzaItem.id}/cancel-unavailable`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'Second cancel reason' },
        },
      );

      expect(dupRes.status).toBe(400);
      expect(app.errorOf(dupRes).code).toBe('ITEM_ALREADY_CANCELLED');
    });

    it('rejects cancellation without reason (400 MISSING_CANCELLATION_REASON)', async () => {
      const order = await placeAndCaptureOrder({
        fulfillmentMode: 'AT_STATION',
        items: [{ product_id: burgerProductId, quantity: 1 }],
      });

      const detailRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const burgerItem = (detailRes.json as any).items[0];

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${order.order_id}/items/${burgerItem.id}/cancel-unavailable`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: '   ' },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('MISSING_CANCELLATION_REASON');
    });
  });

  // ===========================================================================
  // 3. Physical Stock Reconciliation Ledger & Discrepancies
  // ===========================================================================
  describe('Physical Stock Reconciliation Ledger & Discrepancy Auditing', () => {
    let auditId: string;

    it('performs physical stock reconciliation and records shrinkage and surplus adjustments in stock ledger', async () => {
      // Products before reconciliation:
      // Energy Drink: on_hand = 50. Let's count 46 (shrinkage of 4 units).
      // Burger: on_hand = 20. Let's count 23 (surplus of 3 units).
      const reconRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            notes: 'Weekly Monday morning bar inventory count',
            items: [
              {
                product_id: energyDrinkProductId,
                counted_stock: 46,
                notes: 'Found 4 expired/dented cans',
              },
              {
                product_id: burgerProductId,
                counted_stock: 23,
                notes: 'Received extra supplier bonus patties',
              },
            ],
          },
        },
      );

      expect(reconRes.status).toBe(200);
      const audit = reconRes.json as any;
      auditId = audit.id;

      expect(audit.items_counted).toBe(2);
      expect(audit.discrepancy_items_count).toBe(2);
      expect(audit.total_discrepancy_units).toBe(0); // -4 (energy drink) + 4 (burger) = 0
      expect(audit.total_shrinkage_value_minor).toBe(4 * 1500); // 6000 minor
      expect(audit.status).toBe('COMPLETED');
      expect(audit.items).toHaveLength(2);

      const energyReconItem = audit.items.find((i: any) => i.product_id === energyDrinkProductId);
      expect(energyReconItem.adjustment_type).toBe('SHRINKAGE');
      expect(energyReconItem.discrepancy_quantity).toBe(-4);

      const burgerReconItem = audit.items.find((i: any) => i.product_id === burgerProductId);
      expect(burgerReconItem.adjustment_type).toBe('SURPLUS');
      expect(burgerReconItem.discrepancy_quantity).toBe(4);

      // Verify product stock_on_hand updated
      const pEnergy = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect((pEnergy.json as any).stock_on_hand).toBe(46);

      const pBurger = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${burgerProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect((pBurger.json as any).stock_on_hand).toBe(23);

      // Verify stock movement ledger recorded movements
      const historyRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}/stock-history`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const history = Array.isArray(historyRes.json) ? historyRes.json : (historyRes.json as any).movements;
      const latestEnergyMovement = history[0];
      expect(latestEnergyMovement.movement_type).toBe('DAMAGE_WASTE');
      expect(latestEnergyMovement.quantity_delta).toBe(-4);
      expect(latestEnergyMovement.balance_after).toBe(46);
    });

    it('lists stock reconciliations for the venue with pagination', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        { headers: { cookie: fixtures.reception.cookie } },
      );

      expect(res.status).toBe(200);
      const list = res.json as any;
      expect(list.total_count).toBeGreaterThanOrEqual(1);
      expect(list.audits.some((a: any) => a.id === auditId)).toBe(true);
    });

    it('retrieves detailed stock reconciliation audit by ID', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation/${auditId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );

      expect(res.status).toBe(200);
      const detail = res.json as any;
      expect(detail.id).toBe(auditId);
      expect(detail.items).toHaveLength(2);
      expect(detail.performed_by).toBe(fixtures.manager.userId);
    });

    it('rejects empty reconciliation items array (400 MISSING_RECONCILIATION_ITEMS)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { items: [] },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('MISSING_RECONCILIATION_ITEMS');
    });
  });

  // ===========================================================================
  // 4. Authorization & Cross-Venue Security Boundaries
  // ===========================================================================
  describe('Authorization & Cross-Venue Security Boundaries', () => {
    it('prohibits customer from accessing stock reconciliation (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        { headers: { cookie: customerUser.cookie } },
      );
      expect(res.status).toBe(404);
    });

    it('prohibits reception staff from submitting stock reconciliation (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            items: [{ product_id: burgerProductId, counted_stock: 20 }],
          },
        },
      );
      expect(res.status).toBe(403);
    });

    it('enforces cross-venue boundary: Venue B staff cannot access Venue A stock reconciliations', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/stock-reconciliation`,
        { headers: { cookie: otherVenueFixtures.manager.cookie } },
      );
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
