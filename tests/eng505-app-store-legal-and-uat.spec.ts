import { TestApp, startTestApp } from './support/auth-harness';
import { randomUUID } from 'crypto';

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
    `INSERT INTO venues (tenant_id, name, timezone, address, contact, publication_state)
     VALUES ($1, $2, 'Europe/Bucharest', '{"street": "Str. Academiei 1", "city": "Bucuresti", "country": "RO"}', '{"email": "contact@pilot.ro"}', 'DRAFT')
     RETURNING id`,
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

describe('ENG-505 App Store Submission, Legal/Fiscal Sign-Offs, and 1-Venue UAT', () => {
  let app: TestApp;
  let pilotVenue: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customer1: Fixture;
  let customer2: Fixture;

  // UAT Fixture State
  let roomMainArenaId: string;
  let roomConsoleZoneId: string;
  let roomVipSuiteId: string;
  let pcIds: string[] = [];
  let consoleIds: string[] = [];
  let vipPcIds: string[] = [];
  let vipRoomResourceId: string;
  let policyId: string;
  let soloBookingId: string;
  let soloHoldId: string;
  let energyDrinkId: string;
  let snackId: string;
  let orderStationId: string;
  let orderBarId: string;

  beforeAll(async () => {
    app = await startTestApp('eng505', { browserClient: true });
    pilotVenue = await createVenueWithRoles(app, 'Arena Pilot Gaming SRL', 'Arena Pilot Bucharest');

    const c1 = await app.verifiedUser();
    customer1 = { ...c1, tenantId: pilotVenue.tenantId, venueId: pilotVenue.venueId };

    const c2 = await app.verifiedUser();
    customer2 = { ...c2, tenantId: pilotVenue.tenantId, venueId: pilotVenue.venueId };
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  // ===========================================================================
  // 1. App Store & Google Play Submission Compliance
  // ===========================================================================
  describe('App Store & Google Play Submission Readiness Compliance', () => {
    it('returns complete compliance manifest with Apple 3.1.3(e) physical services exemption', async () => {
      const res = await app.call('GET', '/v1/compliance/manifest');
      expect(res.status).toBe(200);
      const manifest = res.json as any;

      expect(manifest.version).toBe('1.0.0-enterprise');
      expect(manifest.storeReview.appleGuideline313ePhysicalServices.compliant).toBe(true);
      expect(manifest.storeReview.appleGuideline313ePhysicalServices.justification).toContain(
        'Apple App Review Guideline 3.1.3(e)',
      );
      expect(manifest.storeReview.googlePlayBillingPolicy.compliant).toBe(true);

      // Apple Review Guideline 5.1.1(v) - In-App Account Deletion
      expect(manifest.storeReview.accountDeletion.compliant).toBe(true);
      expect(manifest.storeReview.accountDeletion.endpoint).toBe('/v1/auth');
      expect(manifest.storeReview.accountDeletion.method).toBe('DELETE');

      // Privacy nutrition labels: zero location and zero cross-app tracking
      expect(manifest.storeReview.privacyNutritionLabels.trackingEnabled).toBe(false);
      expect(manifest.storeReview.privacyNutritionLabels.locationTrackingEnabled).toBe(false);
    });

    it('returns store review kit with sandbox credentials, test cards, and demo instructions', async () => {
      const res = await app.call('GET', '/v1/compliance/store-review-kit');
      expect(res.status).toBe(200);
      const kit = res.json as any;

      expect(kit.appName).toBe('GamerBooker');
      expect(kit.appleGuidelineCompliance).toContain('3.1.3(e)');
      expect(kit.demoAccounts.length).toBeGreaterThanOrEqual(2);
      expect(kit.testPaymentCards.length).toBeGreaterThanOrEqual(1);
      expect(kit.walkthroughSteps.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ===========================================================================
  // 2. Legal & Fiscal Sign-Off Validation
  // ===========================================================================
  describe('Legal & Fiscal Sign-Off Validation', () => {
    it('declares Romanian statutory legal compliance (OUG 34/2014, Law 42/2024, OUG 28/1999)', async () => {
      const res = await app.call('GET', '/v1/compliance/manifest');
      expect(res.status).toBe(200);
      const manifest = res.json as any;

      const statutory = manifest.legalAndFiscal.romanianStatutoryCompliance;
      expect(statutory.oug34_2014_LeisureException.applicable).toBe(true);
      expect(statutory.oug34_2014_LeisureException.article).toContain('16');
      expect(statutory.law42_2024_AgeVerification.applicable).toBe(true);
      expect(statutory.law42_2024_AgeVerification.mandatoryStaffCheck).toBe(true);
      expect(statutory.oug28_1999_FiscalNotice.mandatoryReceiptNoticeText).toContain(
        'nu substituie bonul fiscal eliberat de casa de marcat',
      );

      // Sign-off status
      expect(manifest.legalAndFiscal.signOffAudit.legalSignOffStatus).toBe('APPROVED');
      expect(manifest.legalAndFiscal.signOffAudit.fiscalSignOffStatus).toBe('APPROVED');
      expect(manifest.legalAndFiscal.signOffAudit.platformReviewReadiness).toBe('READY_FOR_SUBMISSION');
    });

    it('verifies venue fiscal readiness status before publication', async () => {
      // Create initial policy profile to make venue fiscally ready
      await app.db.query(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Pilot Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 40, "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 3, "late_cancellation_penalty_percent": 50, "deposit_mode_settlement": "ONLINE_OR_RECEPTION"}')`,
        [pilotVenue.venueId],
      );

      const res = await app.call(
        'GET',
        `/v1/compliance/venues/${pilotVenue.venueId}/fiscal-status`,
        { headers: { cookie: pilotVenue.owner.cookie } },
      );
      expect(res.status).toBe(200);
      const status = res.json as any;

      expect(status.legal_name).toBe('Arena Pilot Gaming SRL');
      expect(status.fiscal_ready).toBe(true);
      expect(status.missing_requirements).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 3. The 5-Step Proprietor UAT Script Walkthrough
  // ===========================================================================
  describe('1-Venue Full End-to-End Pilot UAT Script Simulation', () => {
    // -------------------------------------------------------------------------
    // Step 1: Onboard venue, 3 rooms; configure 10 PCs, 2 consoles, private room (5 PCs)
    // -------------------------------------------------------------------------
    it('UAT Step 1: Onboard venue with 3 rooms, 10 PCs, 2 consoles, and private room with 5 PCs', async () => {
      // 1. Create 3 rooms
      const rMain = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [pilotVenue.venueId, 'Main Arena'],
      );
      roomMainArenaId = rMain.rows[0].id;

      const rConsole = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [pilotVenue.venueId, 'Console Zone'],
      );
      roomConsoleZoneId = rConsole.rows[0].id;

      const rVip = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [pilotVenue.venueId, 'VIP Suite'],
      );
      roomVipSuiteId = rVip.rows[0].id;

      // 2. Configure 10 PCs in Main Arena
      const pcInserts = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          app.db.query<{ id: string }>(
            `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
             VALUES ($1, $2, 'PC', $3, 'AVAILABLE', true) RETURNING id`,
            [pilotVenue.venueId, roomMainArenaId, `PC-${String(i + 1).padStart(2, '0')}`],
          ),
        ),
      );
      pcIds = pcInserts.map((r) => r.rows[0].id);
      expect(pcIds).toHaveLength(10);

      // 3. Configure 2 Consoles in Console Zone
      const c1 = await app.db.query<{ id: string }>(
        `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
         VALUES ($1, $2, 'CONSOLE_SETUP', 'PS5-01', 'AVAILABLE', true) RETURNING id`,
        [pilotVenue.venueId, roomConsoleZoneId],
      );
      const c2 = await app.db.query<{ id: string }>(
        `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
         VALUES ($1, $2, 'CONSOLE_SETUP', 'PS5-02', 'AVAILABLE', true) RETURNING id`,
        [pilotVenue.venueId, roomConsoleZoneId],
      );
      consoleIds = [c1.rows[0].id, c2.rows[0].id];

      // 4. Configure Private Room VIP-ROOM-1 containing 5 interior PCs
      const vipRoomRes = await app.db.query<{ id: string }>(
        `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
         VALUES ($1, $2, 'PRIVATE_ROOM', 'VIP-ROOM-1', 'AVAILABLE', true) RETURNING id`,
        [pilotVenue.venueId, roomVipSuiteId],
      );
      vipRoomResourceId = vipRoomRes.rows[0].id;

      const vipPcInserts = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          app.db.query<{ id: string }>(
            `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
             VALUES ($1, $2, 'PC', $3, 'AVAILABLE', true) RETURNING id`,
            [pilotVenue.venueId, roomVipSuiteId, `VIP-PC-${String(i + 1).padStart(2, '0')}`],
          ),
        ),
      );
      vipPcIds = vipPcInserts.map((r) => r.rows[0].id);

      // Link DAG components: VIP-ROOM-1 contains all 5 VIP-PCs
      for (const childId of vipPcIds) {
        await app.db.query(
          `INSERT INTO resource_components (venue_id, parent_resource_id, child_resource_id)
           VALUES ($1, $2, $3)`,
          [pilotVenue.venueId, vipRoomResourceId, childId],
        );
      }

      // Verify total equipment count: 10 + 2 + 1 + 5 = 18 resources
      const countRes = await app.db.query<{ count: string }>(
        'SELECT count(*)::text as count FROM resources WHERE venue_id = $1',
        [pilotVenue.venueId],
      );
      expect(Number(countRes.rows[0].count)).toBe(18);
    });

    // -------------------------------------------------------------------------
    // Step 2: Configure deposit 40%, cancel free 3h, min 60m, rest online and reception
    // -------------------------------------------------------------------------
    it('UAT Step 2: Configure deposit 40%, free cancellation 3h, min 60m, settlement online and reception', async () => {
      // Setup operating schedule
      for (let day = 0; day <= 6; day++) {
        await app.db.query(
          `INSERT INTO operating_schedules (venue_id, day_of_week, open_time, close_time, is_closed)
           VALUES ($1, $2, '08:00:00', '23:59:00', false)
           ON CONFLICT (venue_id, day_of_week) DO UPDATE SET open_time = EXCLUDED.open_time`,
          [pilotVenue.venueId, day],
        );
      }

      // Configure price rules
      await app.db.query(
        `INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency)
         VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')`,
        [pilotVenue.venueId],
      );
      await app.db.query(
        `INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency)
         VALUES ($1, 'RESOURCE', $2, 8000, 'RON')`,
        [pilotVenue.venueId, vipRoomResourceId],
      );

      const polRes = await app.db.query<{ id: string; settings: any }>(
        'SELECT id, settings FROM policy_profiles WHERE venue_id = $1 AND is_default = true',
        [pilotVenue.venueId],
      );
      policyId = polRes.rows[0].id;
      const s = polRes.rows[0].settings;

      expect(s.deposit_percentage).toBe(40);
      expect(s.free_cancellation_hours).toBe(3);
      expect(s.min_duration_minutes).toBe(60);
      expect(s.deposit_mode_settlement).toBe('ONLINE_OR_RECEPTION');
    });

    // -------------------------------------------------------------------------
    // Step 3: Publish layout, preview client, simulate solo & group bookings
    // -------------------------------------------------------------------------
    it('UAT Step 3: Publish layout revision, preview client view, simulate solo and group booking', async () => {
      // 1. Initialize draft layout and publish revision 1
      await app.db.query(
        `INSERT INTO layout_drafts (
          venue_id, revision, schema_version, canvas, rooms, layers, nodes
        ) VALUES (
          $1, 1, 1,
          '{"width": 1600, "height": 1000, "grid": 20}'::jsonb,
          $2::jsonb,
          '[{"id": "equipment", "name": "Equipment", "visible": true, "locked": false}]'::jsonb,
          $3::jsonb
        )`,
        [
          pilotVenue.venueId,
          JSON.stringify([
            { id: roomMainArenaId, name: 'Main Arena', shape: { kind: 'rect', x: 40, y: 40, w: 600, h: 400 } },
          ]),
          JSON.stringify([
            { id: 'node-pc-1', kind: 'RESOURCE', layer_id: 'equipment', room_id: roomMainArenaId, resource_id: pcIds[0], label: 'PC-01', x: 60, y: 80, w: 60, h: 40 },
          ]),
        ],
      );

      const pubRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/layout/publish`,
        {
          headers: { cookie: pilotVenue.owner.cookie },
          body: {
            expected_draft_revision: 1,
            change_summary: 'UAT initial pilot layout publication',
          },
        },
      );
      expect(pubRes.status).toBe(200);

      await app.db.query(
        "UPDATE venues SET publication_state = 'PUBLISHED' WHERE id = $1",
        [pilotVenue.venueId],
      );

      // 2. Client layout preview
      const previewRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${pilotVenue.venueId}/layout/preview`,
        { headers: { cookie: pilotVenue.reception.cookie } },
      );
      expect(previewRes.status).toBe(200);
      const preview = (previewRes.json as any).preview;
      expect(preview.summary.total_resources).toBeGreaterThanOrEqual(1);

      // 3. Simulate solo booking (PC-01, 2 hours)
      const startsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 26 * 3600 * 1000).toISOString();

      const quoteRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer1.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          resource_ids: [pcIds[0]],
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });
      expect(quoteRes.status).toBe(201);
      const quote = quoteRes.json as any;
      // 2 hours * 3000 = 6000 total; deposit 40% = 2400 due now; balance = 3600
      expect(quote.total_minor).toBe(6000);
      expect(quote.due_now_minor).toBe(2400);
      expect(quote.balance_minor).toBe(3600);

      const holdRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer1.cookie },
        body: { quote_id: quote.quote_id },
      });
      expect(holdRes.status).toBe(201);
      soloHoldId = (holdRes.json as any).id;

      // The confirm guard requires server-side proof of the upfront deposit;
      // settle the hold the way the PSP webhook would.
      const upfrontIntentId = await app.settleHoldPayment(soloHoldId);
      const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customer1.cookie },
        body: {
          hold_id: soloHoldId,
          ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
        },
      });
      expect(confirmRes.status).toBe(201);
      const booking = confirmRes.json as any;
      soloBookingId = booking.booking?.id || booking.id;
      expect(booking.public_code || booking.booking?.public_code).toMatch(/^GB-/);

      // Client rolling QR inspection
      const qrRes = await app.call('GET', `/v1/bookings/${soloBookingId}/qr`, {
        headers: { cookie: customer1.cookie },
      });
      expect(qrRes.status).toBe(200);
      expect((qrRes.json as any).token).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Step 4: Confirm split-pay and reception balance; place consumables at station and bar
    // -------------------------------------------------------------------------
    it('UAT Step 4: Confirm reception balance payment with offline receipt; place consumables at station and bar', async () => {
      // 1. Reception balance payment (3600 minor)
      const payRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/bookings/${soloBookingId}/pay-balance`,
        {
          headers: { cookie: pilotVenue.reception.cookie },
          body: {
            amount_minor: 3600,
            payment_method: 'CASH',
            notes: 'Settled remaining 60% balance at reception desk',
          },
        },
      );
      expect(payRes.status).toBe(201);
      const payData = payRes.json as any;
      expect(payData.reference).toMatch(/^RCP-/);
      expect(payData.amount_minor).toBe(3600);

      // Verify booking balance is now 0
      const bCheck = await app.db.query<{ balance_minor: string; paid_minor: string }>(
        'SELECT balance_minor, paid_minor FROM bookings WHERE id = $1',
        [soloBookingId],
      );
      expect(Number(bCheck.rows[0].balance_minor)).toBe(0);
      expect(Number(bCheck.rows[0].paid_minor)).toBe(6000);

      // 2. Setup consumables catalog
      const catRes = await app.db.query<{ id: string }>(
        `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
         VALUES ($1, $2, 'UAT Refreshments', true) RETURNING id`,
        [pilotVenue.tenantId, pilotVenue.venueId],
      );

      // Energy Drink with Law 42/2024 age verification flag
      const edRes = await app.db.query<{ id: string }>(
        `INSERT INTO products (
           tenant_id, venue_id, category_id, sku, title, price_minor, currency,
           stock_on_hand, stock_reserved, inventory_tracking, restricted_product_type,
           age_verification_required, active
         ) VALUES ($1, $2, $3, 'UAT-ENERGY-01', 'Monster Energy 500ml', 1500, 'RON', 20, 0, true, 'ENERGY_DRINK', true, true)
         RETURNING id`,
        [pilotVenue.tenantId, pilotVenue.venueId, catRes.rows[0].id],
      );
      energyDrinkId = edRes.rows[0].id;

      // Snack for bar pickup
      const snRes = await app.db.query<{ id: string }>(
        `INSERT INTO products (
           tenant_id, venue_id, category_id, sku, title, price_minor, currency,
           stock_on_hand, stock_reserved, inventory_tracking, active
         ) VALUES ($1, $2, $3, 'UAT-SNACK-01', 'Doritos Nacho', 1200, 'RON', 30, 0, true, true)
         RETURNING id`,
        [pilotVenue.tenantId, pilotVenue.venueId, catRes.rows[0].id],
      );
      snackId = snRes.rows[0].id;

      // 3. Place AT_STATION order for Energy Drink
      const ordStationRes = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customer1.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          booking_id: soloBookingId,
          order_type: 'PRE_ORDER',
          fulfillment_mode: 'AT_STATION',
          target_resource_id: pcIds[0],
          items: [{ product_id: energyDrinkId, quantity: 1 }],
          idempotency_key: `uat-ord-st-${randomUUID()}`,
        },
      });
      expect(ordStationRes.status).toBe(201);
      orderStationId = (ordStationRes.json as any).order_id;

      // 4. Place BAR_PICKUP order for Snack
      const ordBarRes = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customer1.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          booking_id: soloBookingId,
          order_type: 'PRE_ORDER',
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: snackId, quantity: 1 }],
          idempotency_key: `uat-ord-bar-${randomUUID()}`,
        },
      });
      expect(ordBarRes.status).toBe(201);
      orderBarId = (ordBarRes.json as any).order_id;
      const pickupCode = (ordBarRes.json as any).pickup_code;
      expect(pickupCode).toBeTruthy();

      // Progress bar order to READY
      await app.db.query(
        "UPDATE orders SET status = 'READY' WHERE id = $1",
        [orderBarId],
      );

      // Verify counter pickup handoff with Crockford pickup code
      const handoffBarRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/orders/${orderBarId}/handoff`,
        {
          headers: { cookie: pilotVenue.reception.cookie },
          body: { pickup_code: pickupCode },
        },
      );
      expect(handoffBarRes.status).toBe(200);
      expect((handoffBarRes.json as any).status).toBe('HANDED_OFF');

      // Progress station order to READY
      await app.db.query(
        "UPDATE orders SET status = 'READY' WHERE id = $1",
        [orderStationId],
      );

      // Law 42/2024 compliance: handing off energy drink requires age verification
      const handoffStationDenied = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/orders/${orderStationId}/handoff`,
        {
          headers: { cookie: pilotVenue.reception.cookie },
          body: { age_verified: false },
        },
      );
      expect(handoffStationDenied.status).toBe(400);
      expect(app.errorOf(handoffStationDenied).code).toBe('AGE_VERIFICATION_REQUIRED');

      // Successful handoff with staff age verification
      const handoffStationSuccess = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/orders/${orderStationId}/handoff`,
        {
          headers: { cookie: pilotVenue.reception.cookie },
          body: { age_verified: true },
        },
      );
      expect(handoffStationSuccess.status).toBe(200);
      expect((handoffStationSuccess.json as any).status).toBe('HANDED_OFF');
    });

    // -------------------------------------------------------------------------
    // Step 5: Fault injection: conflict, PC maintenance, stock-out, refund, reconciliation
    // -------------------------------------------------------------------------
    it('UAT Step 5: Fault injection (conflict, maintenance, stock-out, refund, reconciliation report)', async () => {
      // 1. Conflict: Attempt overlapping hold on PC-01 during existing booking window
      const startsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 26 * 3600 * 1000).toISOString();

      const confQuoteRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer2.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          resource_ids: [pcIds[0]],
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });
      expect(confQuoteRes.status).toBe(201);

      const confHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer2.cookie },
        body: { quote_id: (confQuoteRes.json as any).quote_id },
      });
      // GiST exclusion invariant prevents double-booking
      expect(confHoldRes.status).toBe(409);
      expect(app.errorOf(confHoldRes).code).toBe('RESOURCE_UNAVAILABLE');

      // 2. PC Maintenance Block: Schedule maintenance on PS5-01
      const maintRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${pilotVenue.venueId}/resources/${consoleIds[0]}/maintenance-blocks`,
        {
          headers: { cookie: pilotVenue.manager.cookie },
          body: {
            reason: 'Firmware upgrade and cleaning',
            starts_at: startsAt,
            ends_at: endsAt,
          },
        },
      );
      expect(maintRes.status).toBe(201);

      // Verify PS5-01 is now blocked for booking
      const maintQuoteRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer2.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          resource_ids: [consoleIds[0]],
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });
      expect(maintQuoteRes.status).toBe(201);
      const maintHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer2.cookie },
        body: { quote_id: (maintQuoteRes.json as any).quote_id },
      });
      expect(maintHoldRes.status).toBe(409);
      expect(app.errorOf(maintHoldRes).code).toBe('RESOURCE_UNAVAILABLE');

      // 3. Stock-Out: Attempt ordering 100 snacks when stock is 29
      const stockOutRes = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customer1.cookie },
        body: {
          venue_id: pilotVenue.venueId,
          booking_id: soloBookingId,
          order_type: 'PRE_ORDER',
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: snackId, quantity: 100 }],
        },
      });
      expect(stockOutRes.status).toBe(400);
      expect(['INSUFFICIENT_STOCK', 'INVALID_CART_CONTENTS']).toContain(app.errorOf(stockOutRes).code);
      expect(app.errorOf(stockOutRes).message).toContain('Insufficient stock');

      // 4. Policy Cancellation & Refund (Customer 1 cancels booking > 3h cutoff)
      const cancelRes = await app.call(
        'POST',
        `/v1/bookings/${soloBookingId}/cancel-policy`,
        {
          headers: { cookie: customer1.cookie },
          body: { reason: 'Schedule changed' },
        },
      );
      expect([200, 201]).toContain(cancelRes.status);
      const cancelData = cancelRes.json as any;
      expect(cancelData.status).toBe('CANCELLED');
      expect(cancelData.refundable_minor).toBeGreaterThan(0);
      expect(cancelData.refund_id).toBeTruthy();

      // Verify refund record exists
      const refundCheck = await app.db.query<{ id: string; amount_minor: string }>(
        'SELECT id, amount_minor FROM refunds WHERE booking_id = $1',
        [soloBookingId],
      );
      expect(refundCheck.rowCount).toBeGreaterThanOrEqual(1);

      // 5. Daily Financial Reconciliation Report
      const today = new Date().toISOString().split('T')[0];
      const reconRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${pilotVenue.venueId}/reconciliation/daily?date=${today}`,
        { headers: { cookie: pilotVenue.manager.cookie } },
      );
      expect(reconRes.status).toBe(200);
      const recon = reconRes.json as any;

      expect(recon.venue_id).toBe(pilotVenue.venueId);
      expect(recon.reception_cash_minor).toBeGreaterThanOrEqual(3600);
      expect(recon.total_collected_minor).toBeGreaterThanOrEqual(3600);
      expect(recon.closing_balance_minor).toBeGreaterThanOrEqual(3600);
    });
  });
});
