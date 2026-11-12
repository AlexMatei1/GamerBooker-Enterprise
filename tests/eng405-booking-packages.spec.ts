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

describe('ENG-405 Booking Packages with Atomic Availability & Stock Validation', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; manager: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };

  let pcResourceId: string;
  let consoleResourceId: string;
  let burgerProductId: string;
  let energyDrinkProductId: string;
  let packageId: string;

  beforeAll(async () => {
    app = await startTestApp('eng405', { browserClient: true });
    fixtures = await createVenueWithRoles(app, 'Cyber Arena SRL', 'Cyber Arena Iasi');
    otherVenueFixtures = await createVenueWithRoles(app, 'Other Venue SRL', 'Other Arena Suceava');
    customerUser = await app.verifiedUser();

    // 1. Rooms, policies, pricing, and resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Main Stage Room'],
    );
    const roomId = r1.rows[0].id;

    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "FULL", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 4000, 'RON')",
      [fixtures.venueId],
    );

    const resPc = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'PC-STAGE-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pcResourceId = resPc.rows[0].id;

    const resConsole = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'CONSOLE_SETUP', 'PS5-STAGE-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    consoleResourceId = resConsole.rows[0].id;

    // 2. Consumable products
    const p1 = await app.call(
      'POST',
      `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
      {
        headers: { cookie: fixtures.manager.cookie },
        body: {
          title: 'Cyber Bacon Burger',
          sku: 'FOOD-BURGER-PKG',
          price_minor: 3500,
          initial_stock: 25,
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
          title: 'Red Bull Energy 250ml',
          sku: 'DRINK-ENERGY-PKG',
          price_minor: 1500,
          initial_stock: 30,
          inventory_tracking: true,
          fulfillment_methods: ['AT_STATION', 'BAR_PICKUP'],
          restricted_product_type: 'ENERGY_DRINK',
          age_verification_required: true,
        },
      },
    );
    expect(p2.status).toBe(201);
    energyDrinkProductId = (p2.json as any).id;
  });

  afterAll(async () => {
    await app.stop();
  });

  // ===========================================================================
  // 1. Package Configuration & Discovery
  // ===========================================================================
  describe('Package Configuration & Discovery', () => {
    it('creates a booking package with workstation requirements and included consumable products', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Pro Gamer 3h Pack (PC + Burger + Red Bull)',
            description: '3 hours of high-spec gaming station plus food and energy drink',
            resource_type: 'PC',
            duration_minutes: 180,
            fixed_price_minor: 13500, // 135 RON bundle price
            items: [
              { product_id: burgerProductId, quantity: 1, allocated_price_minor: 3500 },
              { product_id: energyDrinkProductId, quantity: 1, allocated_price_minor: 1500 },
            ],
          },
        },
      );

      expect(res.status).toBe(201);
      const pkg = res.json as any;
      packageId = pkg.id;

      expect(pkg.name).toBe('Pro Gamer 3h Pack (PC + Burger + Red Bull)');
      expect(pkg.resource_type).toBe('PC');
      expect(pkg.duration_minutes).toBe(180);
      expect(pkg.fixed_price_minor).toBe(13500);
      expect(pkg.items).toHaveLength(2);
      expect(pkg.items[0].product_title).toBe('Cyber Bacon Burger');
      expect(pkg.items[1].product_title).toBe('Red Bull Energy 250ml');
    });

    it('validates package creation constraints: name, duration, and price', async () => {
      // Missing name
      const r1 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: '',
            resource_type: 'PC',
            duration_minutes: 60,
            fixed_price_minor: 5000,
          },
        },
      );
      expect(r1.status).toBe(400);
      expect(app.errorOf(r1).code).toBe('MISSING_PACKAGE_NAME');

      // Invalid duration
      const r2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Valid Name',
            resource_type: 'PC',
            duration_minutes: -30,
            fixed_price_minor: 5000,
          },
        },
      );
      expect(r2.status).toBe(400);
      expect(app.errorOf(r2).code).toBe('INVALID_PACKAGE_DURATION');

      // Invalid price
      const r3 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Valid Name',
            resource_type: 'PC',
            duration_minutes: 60,
            fixed_price_minor: 0,
          },
        },
      );
      expect(r3.status).toBe(400);
      expect(app.errorOf(r3).code).toBe('INVALID_PACKAGE_PRICE');
    });

    it('allows public discovery of active packages with included products and available stock', async () => {
      const res = await app.call('GET', `/v1/venues/${fixtures.venueId}/packages`);
      expect(res.status).toBe(200);

      const list = res.json as any;
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((p: any) => p.id === packageId)).toBe(true);

      const pkg = list.find((p: any) => p.id === packageId);
      expect(pkg.items[0].stock_available).toBeGreaterThanOrEqual(1);
    });

    it('allows staff to update package metadata and price', async () => {
      const res = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/packages/${packageId}`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Pro Gamer 3h Pack (Updated)',
            fixed_price_minor: 14000,
          },
        },
      );

      expect(res.status).toBe(200);
      const updated = res.json as any;
      expect(updated.name).toBe('Pro Gamer 3h Pack (Updated)');
      expect(updated.fixed_price_minor).toBe(14000);
    });
  });

  // ===========================================================================
  // 2. Atomic Availability & Stock Validation on Quotes
  // ===========================================================================
  describe('Atomic Availability & Stock Validation on Package Quotes', () => {
    it('creates signed package quote when resource and consumable stock are available', async () => {
      const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours in future

      const quoteRes = await app.call(
        'POST',
        `/v1/venues/${fixtures.venueId}/packages/${packageId}/quote`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            resource_id: pcResourceId,
            starts_at: start,
          },
        },
      );

      expect(quoteRes.status).toBe(200);
      const quote = quoteRes.json as any;

      expect(quote.quote_id).toBeTruthy();
      expect(quote.package_id).toBe(packageId);
      expect(quote.total_minor).toBe(14000);
      expect(quote.signature).toBeTruthy();

      // Check duration is exactly 180 minutes (3 hours)
      const startMs = new Date(quote.starts_at).getTime();
      const endMs = new Date(quote.ends_at).getTime();
      expect(endMs - startMs).toBe(180 * 60 * 1000);

      // Verify line items include resource and both consumables
      expect(quote.items).toHaveLength(3);
      expect(quote.items[0].resource_id).toBe(pcResourceId);
      expect(quote.items[1].product_id).toBe(burgerProductId);
      expect(quote.items[2].product_id).toBe(energyDrinkProductId);
    });

    it('rejects quote when resource type does not match package requirement (400 INVALID_RESOURCE_FOR_PACKAGE)', async () => {
      const start = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

      const res = await app.call(
        'POST',
        `/v1/venues/${fixtures.venueId}/packages/${packageId}/quote`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            resource_id: consoleResourceId, // Package requires PC!
            starts_at: start,
          },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_RESOURCE_FOR_PACKAGE');
    });

    it('rejects quote when included consumable product is out of stock (400 PACKAGE_PRODUCT_OUT_OF_STOCK)', async () => {
      // Create a test product with 0 stock
      const outProdRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Rare Vintage Energy Drink',
            sku: 'DRINK-OUT-01',
            price_minor: 2500,
            initial_stock: 0,
            inventory_tracking: true,
          },
        },
      );
      const outProductId = (outProdRes.json as any).id;

      // Create a package with this out-of-stock product
      const pkgRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Out of Stock Bundle',
            resource_type: 'PC',
            duration_minutes: 120,
            fixed_price_minor: 8000,
            items: [{ product_id: outProductId, quantity: 1 }],
          },
        },
      );
      const outPkgId = (pkgRes.json as any).id;

      const start = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      const quoteRes = await app.call(
        'POST',
        `/v1/venues/${fixtures.venueId}/packages/${outPkgId}/quote`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            resource_id: pcResourceId,
            starts_at: start,
          },
        },
      );

      expect(quoteRes.status).toBe(400);
      expect(app.errorOf(quoteRes).code).toBe('PACKAGE_PRODUCT_OUT_OF_STOCK');
    });
  });

  // ===========================================================================
  // 3. Package Atomic Hold & Stock Reservation
  // ===========================================================================
  describe('Package Atomic Hold & Stock Reservation', () => {
    it('creates hold and atomically reserves both the workstation and consumable stock', async () => {
      const start = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

      // Check stock before hold
      const pEnergyBefore = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      const energyReservedBefore = (pEnergyBefore.json as any).stock_reserved;

      // 1. Get package quote
      const quoteRes = await app.call(
        'POST',
        `/v1/venues/${fixtures.venueId}/packages/${packageId}/quote`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            resource_id: pcResourceId,
            starts_at: start,
          },
        },
      );
      const quote = quoteRes.json as any;

      // 2. Create hold
      const holdRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerUser.cookie },
        body: { quote_id: quote.quote_id },
      });

      expect(holdRes.status).toBe(201);
      const hold = holdRes.json as any;
      expect(hold.package_id).toBe(packageId);
      expect(hold.status).toBe('ACTIVE');

      // 3. Verify stock_reserved incremented for consumable products
      const pEnergyAfter = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect((pEnergyAfter.json as any).stock_reserved).toBe(energyReservedBefore + 1);

      // 4. Releasing hold frees both workstation and consumable reserved stock
      const relRes = await app.call('POST', `/v1/holds/${hold.id}/release`, {
        headers: { cookie: customerUser.cookie },
      });
      expect(relRes.status).toBe(201);
      expect((relRes.json as any).status).toBe('RELEASED');

      const pEnergyReleased = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${energyDrinkProductId}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect((pEnergyReleased.json as any).stock_reserved).toBe(energyReservedBefore);
    });
  });

  // ===========================================================================
  // 4. Package Confirmation & Automatic Linked Consumables Pre-Order
  // ===========================================================================
  describe('Package Confirmation & Linked Pre-Order Provisioning', () => {
    it('confirms booking package and automatically provisions linked pre-order visible on Bar Board', async () => {
      const start = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      // 1. Get package quote
      const quoteRes = await app.call(
        'POST',
        `/v1/venues/${fixtures.venueId}/packages/${packageId}/quote`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            resource_id: pcResourceId,
            starts_at: start,
          },
        },
      );
      const quote = quoteRes.json as any;

      // 2. Create hold
      const holdRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerUser.cookie },
        body: { quote_id: quote.quote_id },
      });
      const hold = holdRes.json as any;

      // 3. Confirm booking. The confirm guard requires server-side proof of the
      // upfront charge; settle the hold the way the PSP webhook would.
      const upfrontIntentId = await app.settleHoldPayment(hold.id);
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customerUser.cookie },
        body: {
          hold_id: hold.id,
          ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
        },
      });

      expect(confirmRes.status).toBe(201);
      const booking = (confirmRes.json as any).booking || (confirmRes.json as any);
      expect(booking.package_id).toBe(packageId);
      expect(booking.status).toBe('CONFIRMED');

      // 4. Verify linked consumables pre-order was automatically created
      const ordersRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/orders?booking_id=${booking.id}`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect(ordersRes.status).toBe(200);
      const orders = (ordersRes.json as any).orders;
      expect(orders).toHaveLength(1);

      const pkgOrder = orders[0];
      expect(pkgOrder.order_type).toBe('PREORDER');
      expect(pkgOrder.fulfillment_mode).toBe('AT_STATION');
      expect(pkgOrder.target_resource_id).toBe(pcResourceId);
      expect(pkgOrder.status).toBe('PLACED');
      expect(pkgOrder.items).toHaveLength(2);

      // 5. Verify the order appears in the Bar Board queue
      const barBoardRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/bar-board`,
        { headers: { cookie: fixtures.reception.cookie } },
      );
      expect(barBoardRes.status).toBe(200);
      const barBoard = barBoardRes.json as any;
      expect(barBoard.queue.some((o: any) => o.id === pkgOrder.id)).toBe(true);

      // 6. Bar staff progresses lifecycle: accept -> prepare -> ready -> handoff
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${pkgOrder.id}/accept`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${pkgOrder.id}/prepare`, {
        headers: { cookie: fixtures.reception.cookie },
      });
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${pkgOrder.id}/ready`, {
        headers: { cookie: fixtures.reception.cookie },
      });

      // Handoff with age verification for the Red Bull energy drink
      const handoffRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/orders/${pkgOrder.id}/handoff`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { age_verified: true },
        },
      );
      expect(handoffRes.status).toBe(200);
      expect((handoffRes.json as any).status).toBe('HANDED_OFF');
    });

    it('blocks package deletion when future confirmed bookings exist (409 PACKAGE_HAS_ACTIVE_BOOKINGS)', async () => {
      const delRes = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${fixtures.venueId}/packages/${packageId}`,
        { headers: { cookie: fixtures.manager.cookie } },
      );
      expect(delRes.status).toBe(409);
      expect(app.errorOf(delRes).code).toBe('PACKAGE_HAS_ACTIVE_BOOKINGS');
    });
  });

  // ===========================================================================
  // 5. Authorization & Multi-Tenant Boundaries
  // ===========================================================================
  describe('Authorization & Multi-Tenant Boundaries', () => {
    it('prohibits customer from creating packages (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: customerUser.cookie },
          body: {
            name: 'Customer Hack Pack',
            resource_type: 'PC',
            duration_minutes: 60,
            fixed_price_minor: 100,
          },
        },
      );
      expect(res.status).toBe(404);
    });

    it('prohibits reception staff from creating packages (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            name: 'Reception Pack',
            resource_type: 'PC',
            duration_minutes: 60,
            fixed_price_minor: 100,
          },
        },
      );
      expect(res.status).toBe(403);
    });

    it('enforces cross-venue boundary: Venue B staff cannot manage Venue A packages', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/packages`,
        { headers: { cookie: otherVenueFixtures.manager.cookie } },
      );
      expect(res.status).toBe(404);
    });
  });
});
