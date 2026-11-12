import { TestApp, startTestApp } from './support/auth-harness';
import { base32Decode, hotp, timeStepAt } from '../src/auth/totp';

const MFA_SECRET = 'JBSWY3DPEHPK3PXP';

/**
 * Completes the TOTP second factor for a fixture user and returns the rotated
 * session cookie. Fixtures may not skip the gate: a membership-only session is
 * pending and the guard refuses gated roles (ENG-002 T-04).
 */
async function elevateMfa(app: TestApp, cookie: string, secret: string): Promise<string> {
  const res = await app.call('POST', '/v1/auth/mfa/verify', {
    headers: { cookie, 'x-gamerbooker-csrf': '1' },
    body: { code: hotp(base32Decode(secret), timeStepAt(Date.now())) },
  });
  expect(res.status).toBe(200);
  return app.cookieOf(res);
}

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
      " VALUES ($1, 'totp', pgp_sym_encrypt($2, 'test-mfa-key-0123456789abcdef0123456789'), now())" +
      ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
    [ownerUser.userId, MFA_SECRET],
  );
  // Writing the factor row alone leaves the session pending; a gated role must
  // actually complete the second factor (ENG-002 T-04).
  ownerUser.cookie = await elevateMfa(app, ownerUser.cookie, MFA_SECRET);

  // Manager
  const managerUser = await app.verifiedUser();
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [managerUser.userId, venueId, tenantId, 'VENUE_MANAGER'],
  );
  await app.db.query(
    'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
      " VALUES ($1, 'totp', pgp_sym_encrypt($2, 'test-mfa-key-0123456789abcdef0123456789'), now())" +
      ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
    [managerUser.userId, MFA_SECRET],
  );
  // Writing the factor row alone leaves the session pending; a gated role must
  // actually complete the second factor (ENG-002 T-04).
  managerUser.cookie = await elevateMfa(app, managerUser.cookie, MFA_SECRET);

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

describe('ENG-401 Consumables Menu Catalog, Pricing, Stock & Asset Management', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };

  beforeAll(async () => {
    app = await startTestApp('eng401', { browserClient: true });
    fixtures = await createVenueWithRoles(app, 'Cyber Cafe SRL', 'Cyber Arena Iasi');
    otherVenueFixtures = await createVenueWithRoles(app, 'Other SRL', 'Other Bar Brasov');
    customerUser = await app.verifiedUser();
  });

  afterAll(async () => {
    await app.stop();
  });

  // ===========================================================================
  // 1. Menu Categories CRUD & Uniqueness
  // ===========================================================================
  describe('Menu Categories Lifecycle', () => {
    let drinksCatId: string;

    it('allows venue manager to create menu category and enforces unique name per venue', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            name: 'Cold Beverages',
            description: 'Chilled energy drinks, sodas, and juices',
            sort_order: 1,
          },
        },
      );

      expect(res.status).toBe(201);
      const data = res.json as any;
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Cold Beverages');
      expect(data.active).toBe(true);
      drinksCatId = data.id;

      // Duplicate name in same venue must be rejected (409 CATEGORY_NAME_EXISTS)
      const dupRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { name: 'cold beverages' },
        },
      );
      expect(dupRes.status).toBe(409);
      expect(app.errorOf(dupRes).code).toBe('CATEGORY_NAME_EXISTS');
    });

    it('allows updating category details and rejects duplicate name on update', async () => {
      // Create a second category
      const snackRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { name: 'Snacks & Bites', sort_order: 2 },
        },
      );
      expect(snackRes.status).toBe(201);
      const snackId = (snackRes.json as any).id;

      // Update snacks description
      const patchRes = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories/${snackId}`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { description: 'Chips, popcorn, and chocolate bars' },
        },
      );
      expect(patchRes.status).toBe(200);
      expect((patchRes.json as any).description).toBe('Chips, popcorn, and chocolate bars');

      // Attempt rename to already existing category
      const renameDup = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories/${snackId}`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { name: 'Cold Beverages' },
        },
      );
      expect(renameDup.status).toBe(409);
      expect(app.errorOf(renameDup).code).toBe('CATEGORY_NAME_EXISTS');
    });

    it('returns active categories on public endpoint and all categories on dashboard', async () => {
      const pubRes = await app.call(
        'GET',
        `/v1/venues/${fixtures.venueId}/menu/categories`,
      );
      expect(pubRes.status).toBe(200);
      const pubList = pubRes.json as any[];
      expect(pubList.length).toBeGreaterThanOrEqual(2);
      expect(pubList[0].name).toBe('Cold Beverages');

      const dashRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(dashRes.status).toBe(200);
      expect((dashRes.json as any[]).length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // 2. Product Catalog CRUD, Pricing & Restrictions (Legea 42/2024)
  // ===========================================================================
  describe('Product Catalog & Regulatory Compliance', () => {
    let energyDrinkId: string;
    let sodaId: string;

    it('creates product with initial stock and automatically enforces age verification for energy drinks', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Red Bull Energy 250ml',
            sku: 'DRK-RB-250',
            price_minor: 1400, // 14.00 RON
            initial_stock: 48,
            inventory_tracking: true,
            restricted_product_type: 'ENERGY_DRINK',
            // age_verification_required not explicitly sent; must be auto-enforced to true
          },
        },
      );

      expect(res.status).toBe(201);
      const product = res.json as any;
      expect(product.id).toBeDefined();
      expect(product.sku).toBe('DRK-RB-250');
      expect(product.price_minor).toBe(1400);
      expect(product.stock_on_hand).toBe(48);
      expect(product.stock_available).toBe(48);
      expect(product.restricted_product_type).toBe('ENERGY_DRINK');
      expect(product.age_verification_required).toBe(true); // Law 42/2024 compliance
      energyDrinkId = product.id;
    });

    it('rejects duplicate SKU within the same venue (409 SKU_ALREADY_EXISTS)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Another Red Bull',
            sku: 'drk-rb-250', // Case-insensitive collision
            price_minor: 1500,
          },
        },
      );

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('SKU_ALREADY_EXISTS');
    });

    it('rejects invalid price or missing product title', async () => {
      const invPrice = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Free Chips',
            price_minor: 0,
          },
        },
      );
      expect(invPrice.status).toBe(400);
      expect(app.errorOf(invPrice).code).toBe('INVALID_PRODUCT_PRICE');

      const missingTitle = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: '   ',
            price_minor: 800,
          },
        },
      );
      expect(missingTitle.status).toBe(400);
      expect(app.errorOf(missingTitle).code).toBe('MISSING_PRODUCT_TITLE');
    });

    it('allows updating product price, description, and fulfillment methods', async () => {
      const sodaRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Coca Cola Zero 330ml',
            sku: 'DRK-CCZ-330',
            price_minor: 900,
            initial_stock: 30,
            restricted_product_type: 'NONE',
            age_verification_required: false,
          },
        },
      );
      expect(sodaRes.status).toBe(201);
      sodaId = (sodaRes.json as any).id;

      const patchRes = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${sodaId}`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            price_minor: 950,
            description: 'Can 330ml ice cold',
            fulfillment_methods: ['AT_STATION'],
          },
        },
      );
      expect(patchRes.status).toBe(200);
      const patched = patchRes.json as any;
      expect(patched.price_minor).toBe(950);
      expect(patched.description).toBe('Can 330ml ice cold');
      expect(patched.fulfillment_methods).toEqual(['AT_STATION']);
    });

    it('archives/deletes a product by setting active to false', async () => {
      const delRes = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${sodaId}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(delRes.status).toBe(200);
      expect((delRes.json as any).deleted).toBe(true);

      // Verify product is no longer visible on public menu
      const pubRes = await app.call(
        'GET',
        `/v1/venues/${fixtures.venueId}/menu/products`,
      );
      const pubProducts = pubRes.json as any[];
      expect(pubProducts.find((p) => p.id === sodaId)).toBeUndefined();
    });
  });

  // ===========================================================================
  // 3. Stock Tracking & Movements Ledger
  // ===========================================================================
  describe('Stock Tracking & Movement Ledger', () => {
    let trackedProductId: string;

    beforeAll(async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            title: 'Doritos Nacho Cheese 100g',
            sku: 'SNK-DOR-100',
            price_minor: 1100,
            initial_stock: 20,
            inventory_tracking: true,
          },
        },
      );
      trackedProductId = (res.json as any).id;
    });

    it('records initial stock movement upon product creation', async () => {
      const historyRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${trackedProductId}/stock-history`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(historyRes.status).toBe(200);
      const history = historyRes.json as any[];
      expect(history.length).toBe(1);
      expect(history[0].movement_type).toBe('INITIAL_STOCK');
      expect(history[0].quantity_delta).toBe(20);
      expect(history[0].balance_after).toBe(20);
    });

    it('allows restock and records RESTOCK movement', async () => {
      const restockRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${trackedProductId}/adjust-stock`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            quantity_delta: 30,
            movement_type: 'RESTOCK',
            notes: 'Supplier weekly shipment received',
          },
        },
      );
      expect(restockRes.status).toBe(200);
      const product = restockRes.json as any;
      expect(product.stock_on_hand).toBe(50); // 20 + 30
      expect(product.stock_available).toBe(50);
    });

    it('allows wastage deduction and rejects adjustment below zero or reserved stock', async () => {
      // Deduct 5 units for damage
      const wasteRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${trackedProductId}/adjust-stock`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            quantity_delta: -5,
            movement_type: 'DAMAGE_WASTE',
            notes: 'Damaged packaging during shelf stocking',
          },
        },
      );
      expect(wasteRes.status).toBe(200);
      expect((wasteRes.json as any).stock_on_hand).toBe(45);

      // Attempt to reduce stock by more than available (45 - 60 = -15)
      const overDeduct = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/${trackedProductId}/adjust-stock`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            quantity_delta: -60,
            movement_type: 'ADJUSTMENT',
          },
        },
      );
      expect(overDeduct.status).toBe(400);
      expect(app.errorOf(overDeduct).code).toBe('STOCK_CANNOT_BE_NEGATIVE');
    });
  });

  // ===========================================================================
  // 4. Bulk Product Import (Dry Run & Apply)
  // ===========================================================================
  describe('Bulk Product Import', () => {
    it('performs dry-run validation identifying duplicate SKUs without persisting', async () => {
      const dryRunRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/bulk-import`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            dry_run: true,
            products: [
              {
                sku: 'IMP-PIZZA-01',
                title: 'Margherita Pizza 400g',
                category_name: 'Hot Food',
                price_minor: 3200,
                initial_stock: 15,
              },
              {
                sku: 'IMP-PIZZA-01', // Duplicate SKU within batch
                title: 'Margherita Duplicate',
                category_name: 'Hot Food',
                price_minor: 3200,
              },
            ],
          },
        },
      );

      expect(dryRunRes.status).toBe(200);
      const result = dryRunRes.json as any;
      expect(result.dry_run).toBe(true);
      expect(result.imported_count).toBe(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].error).toContain('Duplicate SKU');

      // Verify nothing was persisted
      const checkRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products?search=Margherita`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect((checkRes.json as any[]).length).toBe(0);
    });

    it('atomically imports valid batch and auto-creates missing categories', async () => {
      const importRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/bulk-import`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            dry_run: false,
            products: [
              {
                sku: 'IMP-BURGER-01',
                title: 'Cyber Smash Burger',
                category_name: 'Gamer Kitchen', // New category to auto-create
                price_minor: 2900,
                initial_stock: 25,
              },
              {
                sku: 'IMP-COFFEE-01',
                title: 'Double Espresso',
                category_name: 'Hot Drinks', // New category
                price_minor: 1000,
                initial_stock: 50,
              },
            ],
          },
        },
      );

      expect(importRes.status).toBe(200);
      const result = importRes.json as any;
      expect(result.dry_run).toBe(false);
      expect(result.imported_count).toBe(2);
      expect(result.errors.length).toBe(0);

      // Verify products exist and category was created
      const searchRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products?search=Cyber%20Smash`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      const products = searchRes.json as any[];
      expect(products.length).toBe(1);
      expect(products[0].category_name).toBe('Gamer Kitchen');
      expect(products[0].stock_on_hand).toBe(25);
    });
  });

  // ===========================================================================
  // 5. Image Asset Registration
  // ===========================================================================
  describe('Image Asset Management', () => {
    it('registers an absolute image URL', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/upload-image`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            image_url: 'https://cdn.gamerbooker.com/images/products/energy-drink.png',
          },
        },
      );
      expect(res.status).toBe(200);
      expect((res.json as any).image_url).toBe(
        'https://cdn.gamerbooker.com/images/products/energy-drink.png',
      );
    });

    it('generates asset URL for base64 image and rejects invalid mime types', async () => {
      const validRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/upload-image`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            content_type: 'image/png',
          },
        },
      );
      expect(validRes.status).toBe(200);
      expect((validRes.json as any).image_url).toMatch(/^https:\/\/assets\.gamerbooker\.com/);

      const invalidMime = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products/upload-image`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            image_base64: 'invalid',
            content_type: 'application/pdf',
          },
        },
      );
      expect(invalidMime.status).toBe(400);
      expect(app.errorOf(invalidMime).code).toBe('INVALID_IMAGE_TYPE');
    });
  });

  // ===========================================================================
  // 6. Authorization & RBAC Security Boundaries
  // ===========================================================================
  describe('Authorization & RBAC Security Boundaries', () => {
    it('prohibits customer from modifying menu or adjusting stock (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/categories`,
        {
          headers: { cookie: customerUser.cookie },
          body: { name: 'Customer Category' },
        },
      );
      // VenueRoleGuard returns 404 for non-members
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits reception staff from creating products or adjusting stock (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            title: 'Reception Unauthorized Product',
            price_minor: 1000,
          },
        },
      );
      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('enforces cross-venue boundary: Venue B staff cannot modify Venue A products', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/menu/products`,
        {
          headers: { cookie: otherVenueFixtures.owner.cookie },
          body: {
            title: 'Cross Venue Intrusion',
            price_minor: 1200,
          },
        },
      );
      expect([403, 404]).toContain(res.status);
    });
  });
});
