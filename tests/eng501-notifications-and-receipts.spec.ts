import { TestApp, startTestApp } from './support/auth-harness';
import { TemplatesService } from '../src/notifications/templates.service';

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

describe('ENG-501 Notifications, Templates, Receipts, and Order Status Flows', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customerUser: { userId: string; cookie: string };
  let foreignCustomer: { userId: string; cookie: string };
  let templatesService: TemplatesService;
  let pcId: string;
  let sharedBookingId: string;

  beforeAll(async () => {
    app = await startTestApp('eng501', { browserClient: true });
    templatesService = new TemplatesService();
    fixtures = await createVenueWithRoles(app, 'Nexus Gaming SRL', 'Nexus Flagship Bucharest');
    customerUser = await app.verifiedUser();
    foreignCustomer = await app.verifiedUser();

    // Default policy
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 50, "allow_online_remaining": true, "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    // Default hourly price rule (30.00 RON/h = 3000 bani)
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency)
       VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')`,
      [fixtures.venueId],
    );

    // Setup room and PC resource
    const roomRes = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Esports Arena'],
    );
    const roomId = roomRes.rows[0].id;

    const pcRes = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'PC-NEXUS-01', 'AVAILABLE', true) RETURNING id`,
      [fixtures.venueId, roomId],
    );
    pcId = pcRes.rows[0].id;

    // Create shared booking
    const startsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 26 * 3600 * 1000).toISOString(); // 2 hours = 60.00 RON (6000 bani)

    const quoteRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: customerUser.cookie },
      body: {
        venue_id: fixtures.venueId,
        resource_ids: [pcId],
        starts_at: startsAt,
        ends_at: endsAt,
      },
    });
    expect(quoteRes.status).toBe(201);
    const quote = quoteRes.json as any;

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: customerUser.cookie },
      body: { quote_id: quote.quote_id },
    });
    expect(holdRes.status).toBe(201);
    const hold = holdRes.json as any;

    // Reference bookings are created with a settled upfront charge so the
    // receipt/notification expectations below describe money really taken.
    const upfrontIntentId = await app.settleHoldPayment(hold.id);
    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: customerUser.cookie },
      body: {
        hold_id: hold.id,
        ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
      },
    });
    expect(confirmRes.status).toBe(201);
    const confirmed = confirmRes.json as any;
    sharedBookingId = confirmed.booking?.id || confirmed.id;
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Event Templates & Formatting Engine', () => {
    it('renders localized subject and body for all core event types', () => {
      // 1. Booking Confirmed
      const t1 = templatesService.render('BOOKING_CONFIRMED', {
        public_code: 'GB-NEXUS1',
        venue_name: 'Nexus Arena',
        starts_at: '2026-11-20T14:00:00.000Z',
        ends_at: '2026-11-20T16:00:00.000Z',
        total_minor: 6000,
        due_now_minor: 3000,
        balance_minor: 3000,
        currency: 'RON',
      });
      expect(t1.subject).toContain('GB-NEXUS1');
      expect(t1.bodyText).toContain('Nexus Arena');
      expect(t1.bodyText).toContain('60.00 RON');
      expect(t1.bodyText).toContain('rolling check-in QR code');

      // 2. Booking Cancelled
      const t2 = templatesService.render('BOOKING_CANCELLED', {
        public_code: 'GB-NEXUS1',
        refund_minor: 3000,
        currency: 'RON',
      });
      expect(t2.subject).toContain('Booking Cancelled');
      expect(t2.bodyText).toContain('30.00 RON');

      // 3. Order Ready (BAR_PICKUP)
      const t3 = templatesService.render('ORDER_READY', {
        order_number: 'ORD-12345',
        fulfillment_mode: 'BAR_PICKUP',
        pickup_code: 'PK-42',
      });
      expect(t3.subject).toContain('Order Ready: ORD-12345');
      expect(t3.bodyText).toContain('PK-42');
      expect(t3.bodyText).toContain('pickup at the bar counter');

      // 4. Order Ready (AT_STATION)
      const t4 = templatesService.render('ORDER_READY', {
        order_number: 'ORD-12345',
        fulfillment_mode: 'AT_STATION',
        station_name: 'PC-NEXUS-01',
      });
      expect(t4.bodyText).toContain('delivered to your seat (Station PC-NEXUS-01)');

      // 5. Payment Captured & Refund Succeeded
      const t5 = templatesService.render('PAYMENT_CAPTURED', {
        amount_minor: 3000,
        currency: 'RON',
        reference: 'GB-NEXUS1',
      });
      expect(t5.bodyText).toContain('30.00 RON');

      const t6 = templatesService.render('REFUND_SUCCEEDED', {
        amount_minor: 1500,
        currency: 'RON',
      });
      expect(t6.bodyText).toContain('15.00 RON');
    });
  });

  describe('Notification Dispatch, Deduplication & Preferences', () => {
    it('dispatches notification to in-app inbox and deduplicates repeated event deliveries', async () => {
      const eventId = `evt-test-${Date.now()}`;

      // 1. First dispatch -> SENT
      const res1 = await app.call('POST', '/v1/notifications/dispatch', {
        headers: { cookie: customerUser.cookie },
        body: {
          eventId,
          recipientId: customerUser.userId,
          eventType: 'BOOKING_CONFIRMED',
          context: {
            public_code: 'GB-TEST1',
            venue_name: 'Nexus Arena',
            total_minor: 6000,
            due_now_minor: 3000,
            balance_minor: 3000,
          },
        },
      });
      expect(res1.status).toBe(200);
      expect((res1.json as any).status).toBe('SENT');
      expect((res1.json as any).channel).toBe('IN_APP');

      // 2. Duplicate dispatch with same eventId -> SKIPPED (DUPLICATE_DELIVERY)
      const res2 = await app.call('POST', '/v1/notifications/dispatch', {
        headers: { cookie: customerUser.cookie },
        body: {
          eventId,
          recipientId: customerUser.userId,
          eventType: 'BOOKING_CONFIRMED',
          context: { public_code: 'GB-TEST1' },
        },
      });
      expect(res2.status).toBe(200);
      expect((res2.json as any).status).toBe('SKIPPED');
      expect((res2.json as any).reason).toBe('DUPLICATE_DELIVERY');
    });

    it('enforces marketing opt-in while delivering operational messages', async () => {
      // 1. Initial preferences: marketing_opt_in is false
      const getPrefRes = await app.call('GET', '/v1/notifications/preferences', {
        headers: { cookie: customerUser.cookie },
      });
      expect(getPrefRes.status).toBe(200);
      expect((getPrefRes.json as any).marketing_opt_in).toBe(false);

      // 2. Marketing notification is skipped
      const mktRes = await app.call('POST', '/v1/notifications/dispatch', {
        headers: { cookie: customerUser.cookie },
        body: {
          eventId: `mkt-${Date.now()}`,
          recipientId: customerUser.userId,
          eventType: 'BOOKING_REMINDER',
          isMarketing: true,
          context: { venue_name: 'Nexus' },
        },
      });
      expect(mktRes.status).toBe(200);
      expect((mktRes.json as any).status).toBe('SKIPPED');
      expect((mktRes.json as any).reason).toBe('MARKETING_OPT_OUT');

      // 3. User opts into marketing
      const updatePref = await app.call('PUT', '/v1/notifications/preferences', {
        headers: { cookie: customerUser.cookie },
        body: { marketing_opt_in: true },
      });
      expect(updatePref.status).toBe(200);
      expect((updatePref.json as any).marketing_opt_in).toBe(true);

      // 4. Marketing notification is now sent
      const mktRes2 = await app.call('POST', '/v1/notifications/dispatch', {
        headers: { cookie: customerUser.cookie },
        body: {
          eventId: `mkt-allowed-${Date.now()}`,
          recipientId: customerUser.userId,
          eventType: 'BOOKING_REMINDER',
          isMarketing: true,
          context: { venue_name: 'Nexus' },
        },
      });
      expect(mktRes2.status).toBe(200);
      expect((mktRes2.json as any).status).toBe('SENT');
    });

    it('manages in-app inbox, read state, and unread counts', async () => {
      // List notifications
      const listRes = await app.call('GET', '/v1/notifications', {
        headers: { cookie: customerUser.cookie },
      });
      expect(listRes.status).toBe(200);
      const list = listRes.json as any;
      expect(list.items.length).toBeGreaterThanOrEqual(1);
      expect(list.unread_count).toBeGreaterThanOrEqual(1);

      const targetNotif = list.items[0];
      expect(targetNotif.read).toBe(false);

      // Mark single notification as read
      const readRes = await app.call('PATCH', `/v1/notifications/${targetNotif.id}/read`, {
        headers: { cookie: customerUser.cookie },
      });
      expect(readRes.status).toBe(200);
      expect((readRes.json as any).read).toBe(true);
      expect((readRes.json as any).read_at).toBeTruthy();

      // Foreign user cannot mark read (404 NOTIFICATION_NOT_FOUND)
      const foreignRead = await app.call('PATCH', `/v1/notifications/${targetNotif.id}/read`, {
        headers: { cookie: foreignCustomer.cookie },
      });
      expect(foreignRead.status).toBe(404);

      // Mark all as read
      const markAllRes = await app.call('POST', '/v1/notifications/read-all', {
        headers: { cookie: customerUser.cookie },
      });
      expect(markAllRes.status).toBe(200);

      // Verify unread_count is now 0
      const afterList = await app.call('GET', '/v1/notifications?unread_only=true', {
        headers: { cookie: customerUser.cookie },
      });
      expect(afterList.status).toBe(200);
      expect((afterList.json as any).items.length).toBe(0);
      expect((afterList.json as any).unread_count).toBe(0);
    });
  });

  describe('Customer Booking Receipt View', () => {
    beforeAll(async () => {
      // The online deposit capture (3000 bani) already exists: the suite
      // beforeAll settled the hold through app.settleHoldPayment, exactly as
      // the PSP webhook would, and confirmBooking linked that captured intent
      // to sharedBookingId. A second intent here would double-count the money.

      // Simulate offline cash reception balance payment (3000 bani)
      await app.db.query(
        `INSERT INTO offline_receipts (tenant_id, venue_id, booking_id, staff_id, reference, amount_minor, payment_method)
         VALUES ($1, $2, $3, $4, 'RCP-CASH-001', 3000, 'CASH')`,
        [fixtures.tenantId, fixtures.venueId, sharedBookingId, fixtures.reception.userId],
      );
    });

    it('generates itemized booking receipt with online and offline transactions and VAT breakdown', async () => {
      const receiptRes = await app.call('GET', `/v1/bookings/${sharedBookingId}/receipt`, {
        headers: { cookie: customerUser.cookie },
      });

      expect(receiptRes.status).toBe(200);
      const receipt = receiptRes.json as any;

      // Header & Number
      expect(receipt.receipt_number).toMatch(/^RCP-GB-/);
      expect(receipt.booking.id).toBe(sharedBookingId);

      // Venue entity
      expect(receipt.venue.id).toBe(fixtures.venueId);
      expect(receipt.venue.name).toBe('Nexus Flagship Bucharest');
      expect(receipt.venue.fiscal_code).toContain('NEXUS');

      // Line items
      expect(receipt.items.length).toBe(1);
      expect(receipt.items[0].description).toContain('PC-NEXUS-01');
      expect(receipt.items[0].total_minor).toBe(6000);

      // Financial breakdown
      expect(receipt.summary.total_minor).toBe(6000);
      expect(receipt.summary.vat_minor).toBeGreaterThan(0);
      expect(receipt.summary.subtotal_minor + receipt.summary.vat_minor).toBe(6000);

      expect(receipt.summary.paid_online_minor).toBe(3000);
      expect(receipt.summary.paid_reception_minor).toBe(3000);
      expect(receipt.summary.total_paid_minor).toBe(6000);
      expect(receipt.summary.balance_due_minor).toBe(0);

      // Transactions
      expect(receipt.transactions.length).toBe(2);
      const onlineTx = receipt.transactions.find((t: any) => t.type === 'ONLINE_CAPTURE');
      const offlineTx = receipt.transactions.find((t: any) => t.type === 'RECEPTION_PAYMENT');
      expect(onlineTx).toBeDefined();
      expect(onlineTx.amount_minor).toBe(3000);
      expect(offlineTx).toBeDefined();
      expect(offlineTx.reference).toBe('RCP-CASH-001');

      // Legal notice
      expect(receipt.legal_notice).toContain('OUG 28/1999');
    });

    it('prohibits unauthorized foreign customer from reading booking receipt (404)', async () => {
      const foreignRes = await app.call('GET', `/v1/bookings/${sharedBookingId}/receipt`, {
        headers: { cookie: foreignCustomer.cookie },
      });
      expect(foreignRes.status).toBe(404);
    });
  });

  describe('Customer Order Status Flow Tracking', () => {
    let orderId: string;

    beforeAll(async () => {
      // Create category & product for order
      const catRes = await app.db.query<{ id: string }>(
        `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
         VALUES ($1, $2, 'Snacks & Drinks', true) RETURNING id`,
        [fixtures.tenantId, fixtures.venueId],
      );
      const catId = catRes.rows[0].id;

      const prodRes = await app.db.query<{ id: string }>(
        `INSERT INTO products (tenant_id, venue_id, category_id, sku, title, price_minor, currency, stock_on_hand, active)
         VALUES ($1, $2, $3, 'SNK-01', 'Doritos Chips', 1200, 'RON', 50, true) RETURNING id`,
        [fixtures.tenantId, fixtures.venueId, catId],
      );
      const prodId = prodRes.rows[0].id;

      // Insert order directly in PLACED state for status progression testing
      const ordRes = await app.db.query<{ id: string }>(
        `INSERT INTO orders (
           tenant_id, venue_id, booking_id, customer_id, public_code, pickup_code,
           order_type, fulfillment_mode, status, total_minor, currency
         )
         VALUES ($1, $2, $3, $4, 'ORD-STATUS-01', 'PK-77', 'IN_SESSION', 'BAR_PICKUP', 'PLACED', 1200, 'RON')
         RETURNING id`,
        [fixtures.tenantId, fixtures.venueId, sharedBookingId, customerUser.userId],
      );
      orderId = ordRes.rows[0].id;

      await app.db.query(
        `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price_minor, line_total_minor)
         VALUES ($1, $2, 'Doritos Chips', 1, 1200, 1200)`,
        [orderId, prodId],
      );
    });

    it('tracks sequential order milestones across bar board state progression', async () => {
      // 1. Initial status: PLACED
      const flow1 = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: customerUser.cookie },
      });
      expect(flow1.status).toBe(200);
      const f1 = flow1.json as any;
      expect(f1.current_status).toBe('PLACED');
      expect(f1.pickup_code).toBe('PK-77');
      expect(f1.milestones.find((m: any) => m.status === 'PLACED').active).toBe(true);
      expect(f1.milestones.find((m: any) => m.status === 'ACCEPTED').reached).toBe(false);

      // 2. Bar staff accepts order
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/accept`, {
        headers: { cookie: fixtures.reception.cookie },
        body: { estimated_prep_minutes: 15 },
      });

      const flow2 = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: customerUser.cookie },
      });
      expect(flow2.status).toBe(200);
      const f2 = flow2.json as any;
      expect(f2.current_status).toBe('ACCEPTED');
      expect(f2.milestones.find((m: any) => m.status === 'ACCEPTED').active).toBe(true);
      expect(f2.milestones.find((m: any) => m.status === 'ACCEPTED').reached).toBe(true);
      expect(f2.milestones.find((m: any) => m.status === 'PREPARING').reached).toBe(false);

      // 3. Bar staff begins preparation
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/prepare`, {
        headers: { cookie: fixtures.reception.cookie },
      });

      const flow3 = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: customerUser.cookie },
      });
      const f3 = flow3.json as any;
      expect(f3.current_status).toBe('PREPARING');
      expect(f3.milestones.find((m: any) => m.status === 'PREPARING').active).toBe(true);

      // 4. Bar staff marks ready
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/ready`, {
        headers: { cookie: fixtures.reception.cookie },
      });

      const flow4 = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: customerUser.cookie },
      });
      const f4 = flow4.json as any;
      expect(f4.current_status).toBe('READY');
      expect(f4.milestones.find((m: any) => m.status === 'READY').active).toBe(true);

      // 5. Bar staff hands off order
      await app.call('POST', `/v1/dashboard/venues/${fixtures.venueId}/orders/${orderId}/handoff`, {
        headers: { cookie: fixtures.reception.cookie },
        body: { pickup_code: 'PK-77' },
      });

      const flow5 = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: customerUser.cookie },
      });
      const f5 = flow5.json as any;
      expect(f5.current_status).toBe('HANDED_OFF');
      expect(f5.milestones.find((m: any) => m.status === 'HANDED_OFF').active).toBe(true);
      expect(f5.milestones.find((m: any) => m.status === 'HANDED_OFF').reached).toBe(true);
    });

    it('prohibits unauthorized foreign customer from reading order status flow (404)', async () => {
      const foreignRes = await app.call('GET', `/v1/orders/${orderId}/status-flow`, {
        headers: { cookie: foreignCustomer.cookie },
      });
      expect(foreignRes.status).toBe(404);
    });
  });
});
