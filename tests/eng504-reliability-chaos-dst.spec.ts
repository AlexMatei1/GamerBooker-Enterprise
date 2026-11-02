import { TestApp, startTestApp } from './support/auth-harness';
import { randomUUID } from 'crypto';
import { WebhookReplayHarness } from '../src/payments/webhook-replay.harness';
import { SandboxPaymentProvider } from '../src/payments/sandbox-psp.provider';

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

describe('ENG-504 End-to-End Reliability, Chaos PSP/Refund/Concurrency, and DST Tests', () => {
  let app: TestApp;
  let venue: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let pcId: string;
  let pc2Id: string;
  let roomId: string;
  let customer: Fixture;
  let replayHarness: WebhookReplayHarness;

  beforeAll(async () => {
    app = await startTestApp('eng504');
    replayHarness = new WebhookReplayHarness(new SandboxPaymentProvider());
    venue = await createVenueWithRoles(app, 'Nexus Gaming SRL', 'Nexus Bucharest Arena');
    const custUser = await app.verifiedUser();
    customer = { ...custUser, tenantId: venue.tenantId, venueId: venue.venueId };

    // Setup default policies & prices
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "FULL", "deposit_percentage": 100, "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50, "deposit_mode_settlement": "ONLINE_OR_RECEPTION"}')`,
      [venue.venueId],
    );
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency)
       VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')`,
      [venue.venueId],
    );

    const roomRes = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [venue.venueId, 'Main Hall'],
    );
    roomId = roomRes.rows[0].id;

    const pcRes1 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'PC-NEXUS-01', 'AVAILABLE', true) RETURNING id`,
      [venue.venueId, roomId],
    );
    pcId = pcRes1.rows[0].id;

    const pcRes2 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'PC-NEXUS-02', 'AVAILABLE', true) RETURNING id`,
      [venue.venueId, roomId],
    );
    pc2Id = pcRes2.rows[0].id;
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  // ===========================================================================
  // 1. Daylight Saving Time (DST) Invariants (T-025 & T-026)
  // ===========================================================================
  describe('Daylight Saving Time (DST) Invariants', () => {
    it('T-025: blocks quote for missing local hour on spring-forward Sunday (DST_INVALID_LOCAL_TIME)', async () => {
      // In Europe/Bucharest, on 2026-03-29, clocks jump from 03:00 to 04:00 (+02:00 -> +03:00).
      // Local time 03:30 does not exist!
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: {
          venue_id: venue.venueId,
          resource_ids: [pcId],
          starts_at: '2026-03-29T03:30:00+02:00', // Non-existent local time
          ends_at: '2026-03-29T05:30:00+03:00',
        },
      });

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('DST_INVALID_LOCAL_TIME');
    });

    it('T-026: rejects quote in fall-back duplicate hour without explicit offset (DST_MISSING_EXPLICIT_OFFSET)', async () => {
      // In Europe/Bucharest, on 2026-10-25, clocks fall back from 04:00 to 03:00 (+03:00 -> +02:00).
      // Local time 03:30 repeats twice; without an explicit offset (+03:00 or +02:00), it is ambiguous!
      const res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: {
          venue_id: venue.venueId,
          resource_ids: [pcId],
          starts_at: '2026-10-25T03:30:00', // Missing offset
          ends_at: '2026-10-25T04:30:00',
        },
      });

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('DST_MISSING_EXPLICIT_OFFSET');
    });

    it('T-026: accepts explicit offsets during fall-back, maps to distinct UTC instants without conflict', async () => {
      // Repeated local hour 1: 03:00 at +03:00 = 00:00 UTC, ending at 03:00 at +02:00 = 01:00 UTC (duration 60m)
      const quote1Res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: {
          venue_id: venue.venueId,
          resource_ids: [pcId],
          starts_at: '2026-10-25T03:00:00+03:00', // 00:00 UTC
          ends_at: '2026-10-25T03:00:00+02:00',   // 01:00 UTC
        },
      });
      expect(quote1Res.status).toBe(201);
      const quote1 = quote1Res.json as any;

      const hold1Res = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: quote1.quote_id },
      });
      expect(hold1Res.status).toBe(201);

      // Repeated local hour 2: 03:00 at +02:00 = 01:00 UTC, ending at 04:00 at +02:00 = 02:00 UTC (duration 60m)
      const quote2Res = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: {
          venue_id: venue.venueId,
          resource_ids: [pcId],
          starts_at: '2026-10-25T03:00:00+02:00', // 01:00 UTC
          ends_at: '2026-10-25T04:00:00+02:00',   // 02:00 UTC
        },
      });
      expect(quote2Res.status).toBe(201);
      const quote2 = quote2Res.json as any;

      const hold2Res = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: quote2.quote_id },
      });
      expect(hold2Res.status).toBe(201);

      // Both holds exist on the same PC without collision because UTC intervals [00:00, 01:00) and [01:00, 02:00) do not overlap!
      const claims = await app.db.query(
        'SELECT id, lower(slot) as s, upper(slot) as e FROM resource_claims WHERE resource_id = $1 AND state = $2',
        [pcId, 'ACTIVE_HOLD'],
      );
      expect(claims.rowCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // 2. High-Concurrency Race Condition Chaos (100-Way Resource Concurrency & 0 Overlap)
  // ===========================================================================
  describe('High-Concurrency Resource Race Condition Chaos', () => {
    it('under 15 concurrent hold attempts for the exact same slot, exactly 1 succeeds and 14 fail (0 double booking)', async () => {
      const concurrencyCount = 15;
      const customers = await Promise.all(
        Array.from({ length: concurrencyCount }).map(() => app.verifiedUser()),
      );

      // Same future slot
      const startsAt = new Date(Date.now() + 100 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 102 * 3600 * 1000).toISOString();

      // Generate valid signed quotes for all customers for the identical slot and station
      const quotes = await Promise.all(
        customers.map((c) =>
          app.call('POST', '/v1/quotes', {
            headers: { cookie: c.cookie },
            body: {
              venue_id: venue.venueId,
              resource_ids: [pc2Id],
              starts_at: startsAt,
              ends_at: endsAt,
            },
          }),
        ),
      );

      for (const q of quotes) {
        expect(q.status).toBe(201);
      }

      // Chaos race: fire all hold creations simultaneously
      const holdResults = await Promise.all(
        quotes.map((q, idx) =>
          app.call('POST', '/v1/holds', {
            headers: { cookie: customers[idx].cookie },
            body: { quote_id: (q.json as any).quote_id },
          }),
        ),
      );

      const successfulHolds = holdResults.filter((r) => r.status === 201);
      const conflictHolds = holdResults.filter((r) => r.status === 409);

      // Invariant: Exactly 1 customer secures the hold; all other 14 receive RESOURCE_UNAVAILABLE
      expect(successfulHolds.length).toBe(1);
      expect(conflictHolds.length).toBe(concurrencyCount - 1);
      for (const c of conflictHolds) {
        expect(app.errorOf(c).code).toBe('RESOURCE_UNAVAILABLE');
      }

      // Invariant: DB GiST exclusion constraint strictly contains exactly 1 active claim
      const claimsCheck = await app.db.query(
        `SELECT COUNT(*)::int as count
           FROM resource_claims
          WHERE resource_id = $1
            AND state = 'ACTIVE_HOLD'
            AND slot && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
        [pc2Id, startsAt, endsAt],
      );
      expect(claimsCheck.rows[0].count).toBe(1);
    });
  });

  // ===========================================================================
  // 3. High-Concurrency Out-Of-Stock Protection (T-015)
  // ===========================================================================
  describe('High-Concurrency Out-Of-Stock Protection (T-015)', () => {
    let limitedProdId: string;
    let bookingForCart: string;

    beforeAll(async () => {
      // Create confirmed booking for cart eligibility
      const startsAt = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 202 * 3600 * 1000).toISOString();
      const qRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: { venue_id: venue.venueId, resource_ids: [pcId], starts_at: startsAt, ends_at: endsAt },
      });
      const hRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: (qRes.json as any).quote_id },
      });
      const cRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customer.cookie },
        body: { hold_id: (hRes.json as any).id },
      });
      bookingForCart = (cRes.json as any).booking?.id || (cRes.json as any).id;

      // Create product with strictly 3 units in stock on hand
      const catRes = await app.db.query<{ id: string }>(
        `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
         VALUES ($1, $2, 'Limited Snacks', true) RETURNING id`,
        [venue.tenantId, venue.venueId],
      );
      const pRes = await app.db.query<{ id: string }>(
        `INSERT INTO products (
           tenant_id, venue_id, category_id, sku, title, price_minor, currency,
           stock_on_hand, stock_reserved, inventory_tracking, active
         ) VALUES ($1, $2, $3, 'CHAOS-SNACK-3', 'Rare Energy Bar', 1000, 'RON', 3, 0, true, true)
         RETURNING id`,
        [venue.tenantId, venue.venueId, catRes.rows[0].id],
      );
      limitedProdId = pRes.rows[0].id;
    });

    it('T-015: across 8 concurrent checkouts for a 3-unit stock, exactly 3 succeed and 5 fail with INSUFFICIENT_STOCK', async () => {
      const concurrentCheckouts = 8;
      const checkoutRequests = Array.from({ length: concurrentCheckouts }).map(() =>
        app.call('POST', '/v1/orders/checkout', {
          headers: { cookie: customer.cookie },
          body: {
            venue_id: venue.venueId,
            booking_id: bookingForCart,
            order_type: 'PRE_ORDER',
            fulfillment_mode: 'BAR_PICKUP',
            items: [{ product_id: limitedProdId, quantity: 1 }],
            idempotency_key: `chaos-chk-${randomUUID()}`,
          },
        }),
      );

      const results = await Promise.all(checkoutRequests);

      const successes = results.filter((r) => r.status === 201);
      const stockErrors = results.filter((r) => r.status === 400 && app.errorOf(r).code === 'INSUFFICIENT_STOCK');

      // Invariant: Exactly 3 succeed; remaining 5 fail
      expect(successes.length).toBe(3);
      expect(stockErrors.length).toBe(concurrentCheckouts - 3);

      // Invariant: stock_reserved in DB equals exactly 3; zero overselling
      const prodCheck = await app.db.query<{ stock_on_hand: number; stock_reserved: number }>(
        'SELECT stock_on_hand, stock_reserved FROM products WHERE id = $1',
        [limitedProdId],
      );
      expect(Number(prodCheck.rows[0].stock_on_hand)).toBe(3);
      expect(Number(prodCheck.rows[0].stock_reserved)).toBe(3);
    });
  });

  // ===========================================================================
  // 4. Duplicate Order Handoff Race Protection (T-016)
  // ===========================================================================
  describe('Duplicate Order Handoff Race Protection (T-016)', () => {
    it('T-016: concurrent handoffs on the same order result in a single stock deduction (idempotent)', async () => {
      // 1. Create product with 10 stock
      const catRes = await app.db.query<{ id: string }>(
        `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
         VALUES ($1, $2, 'Handoff Drinks', true) RETURNING id`,
        [venue.tenantId, venue.venueId],
      );
      const prodRes = await app.db.query<{ id: string }>(
        `INSERT INTO products (
           tenant_id, venue_id, category_id, sku, title, price_minor, currency,
           stock_on_hand, stock_reserved, inventory_tracking, active
         ) VALUES ($1, $2, $3, 'HANDOFF-SODA', 'Cold Soda', 1200, 'RON', 10, 1, true, true)
         RETURNING id`,
        [venue.tenantId, venue.venueId, catRes.rows[0].id],
      );
      const prodId = prodRes.rows[0].id;

      // Create a confirmed booking to satisfy orders.booking_id constraint
      const startsAt = new Date(Date.now() + 250 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 252 * 3600 * 1000).toISOString();
      const qRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: { venue_id: venue.venueId, resource_ids: [pcId], starts_at: startsAt, ends_at: endsAt },
      });
      const hRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: (qRes.json as any).quote_id },
      });
      const cRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customer.cookie },
        body: { hold_id: (hRes.json as any).id },
      });
      const bookingId = (cRes.json as any).booking?.id || (cRes.json as any).id;

      // 2. Insert order in READY state with pickup code
      const ordRes = await app.db.query<{ id: string }>(
        `INSERT INTO orders (
           tenant_id, venue_id, booking_id, customer_id, public_code, pickup_code,
           order_type, fulfillment_mode, status, total_minor, currency
         ) VALUES ($1, $2, $3, $4, 'ORD-HANDOFF-1', 'PK-777', 'IN_SESSION', 'BAR_PICKUP', 'READY', 1200, 'RON')
         RETURNING id`,
        [venue.tenantId, venue.venueId, bookingId, customer.userId],
      );
      const orderId = ordRes.rows[0].id;
      await app.db.query(
        `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price_minor, line_total_minor)
         VALUES ($1, $2, 'Cold Soda', 1, 1200, 1200)`,
        [orderId, prodId],
      );

      // 3. Fire 2 concurrent handoff calls
      const [resA, resB] = await Promise.all([
        app.call('POST', `/v1/dashboard/venues/${venue.venueId}/orders/${orderId}/handoff`, {
          headers: { cookie: venue.reception.cookie },
          body: { pickup_code: 'PK-777' },
        }),
        app.call('POST', `/v1/dashboard/venues/${venue.venueId}/orders/${orderId}/handoff`, {
          headers: { cookie: venue.reception.cookie },
          body: { pickup_code: 'PK-777' },
        }),
      ]);

      expect([resA.status, resB.status]).toContain(200);

      // Invariant: stock_on_hand decremented by exactly 1 (from 10 to 9), not double decremented
      const prodAfter = await app.db.query<{ stock_on_hand: number; stock_reserved: number }>(
        'SELECT stock_on_hand, stock_reserved FROM products WHERE id = $1',
        [prodId],
      );
      expect(Number(prodAfter.rows[0].stock_on_hand)).toBe(9);
      expect(Number(prodAfter.rows[0].stock_reserved)).toBe(0);
    });
  });

  // ===========================================================================
  // 5. PSP Webhook Replay & Failure Chaos
  // ===========================================================================
  describe('PSP Webhook Replay & Failure Chaos', () => {
    it('ignores duplicate webhook event without double credit', async () => {
      // 1. Create a payment intent in PENDING status
      const piRes = await app.db.query<{ id: string; provider_ref: string }>(
        `INSERT INTO payment_intents (
           tenant_id, venue_id, provider, provider_ref, idempotency_key,
           amount_minor, currency, status, metadata
         ) VALUES ($1, $2, 'sandbox', 'pi_chaos_dup_1', 'idem-chaos-1', 5000, 'RON', 'PENDING', '{}')
         RETURNING id, provider_ref`,
        [venue.tenantId, venue.venueId],
      );
      const providerRef = piRes.rows[0].provider_ref;

      // 2. Prepare mock webhook event using WebhookReplayHarness
      const event = replayHarness.createEvent(providerRef, 'payment_intent.succeeded', 5000);

      // 3. First webhook delivery
      const res1 = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        headers: { 'x-psp-signature': event.signature },
        body: event.rawBody,
      });
      expect(res1.status).toBe(200);
      expect((res1.json as any).duplicate).toBe(false);

      // Intent should now be CAPTURED
      const pi1 = await app.db.query<{ status: string }>(
        'SELECT status FROM payment_intents WHERE provider_ref = $1',
        [providerRef],
      );
      expect(pi1.rows[0].status).toBe('CAPTURED');

      // 4. Duplicate webhook delivery replay
      const res2 = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        headers: { 'x-psp-signature': event.signature },
        body: event.rawBody,
      });
      expect(res2.status).toBe(200);
      expect((res2.json as any).duplicate).toBe(true);
      expect((res2.json as any).status).toBe('IGNORED');
    });

    it('rejects confirmation for expired hold and triggers 409 or 410 GONE', async () => {
      // Create hold and expire it in DB
      const startsAt = new Date(Date.now() + 300 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 302 * 3600 * 1000).toISOString();
      const qRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: { venue_id: venue.venueId, resource_ids: [pcId], starts_at: startsAt, ends_at: endsAt },
      });
      const hRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: (qRes.json as any).quote_id },
      });
      const holdId = (hRes.json as any).id;

      // Artificially expire the hold
      await app.db.query(
        "UPDATE holds SET status = 'EXPIRED', expires_at = now() - interval '1 hour' WHERE id = $1",
        [holdId],
      );

      // Attempt confirmation
      const confRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customer.cookie },
        body: { hold_id: holdId },
      });

      expect([409, 410]).toContain(confRes.status);
    });
  });

  // ===========================================================================
  // 6. Concurrent Offline Receipt Void Race (T-030)
  // ===========================================================================
  describe('Concurrent Offline Receipt Void Race (T-030)', () => {
    it('T-030: under concurrent void attempts, exactly 1 succeeds and the other receives 409 RECEIPT_ALREADY_VOIDED', async () => {
      // 1. Create confirmed booking with 6000 balance
      const startsAt = new Date(Date.now() + 400 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 402 * 3600 * 1000).toISOString();
      const qRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: customer.cookie },
        body: { venue_id: venue.venueId, resource_ids: [pcId], starts_at: startsAt, ends_at: endsAt },
      });
      const hRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customer.cookie },
        body: { quote_id: (qRes.json as any).quote_id },
      });
      const cRes = await app.call('POST', '/v1/bookings/confirm', {
        headers: { cookie: customer.cookie },
        body: { hold_id: (hRes.json as any).id },
      });
      const bookingId = (cRes.json as any).booking?.id || (cRes.json as any).id;

      // Update booking to have paid 3000, balance 3000
      await app.db.query(
        'UPDATE bookings SET paid_minor = 3000, balance_minor = 3000 WHERE id = $1',
        [bookingId],
      );

      // 2. Insert offline receipt for 2000
      const recRes = await app.db.query<{ id: string }>(
        `INSERT INTO offline_receipts (
           tenant_id, venue_id, booking_id, amount_minor, payment_method,
           reference, staff_id
         ) VALUES ($1, $2, $3, 2000, 'CASH', 'REC-CHAOS-01', $4)
         RETURNING id`,
        [venue.tenantId, venue.venueId, bookingId, venue.reception.userId],
      );
      const receiptId = recRes.rows[0].id;

      // 3. Fire 2 concurrent void requests from managers
      const [resA, resB] = await Promise.all([
        app.call('POST', `/v1/dashboard/venues/${venue.venueId}/receipts/${receiptId}/void`, {
          headers: { cookie: venue.manager.cookie },
          body: { reason: 'Race void test A' },
        }),
        app.call('POST', `/v1/dashboard/venues/${venue.venueId}/receipts/${receiptId}/void`, {
          headers: { cookie: venue.owner.cookie },
          body: { reason: 'Race void test B' },
        }),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      // Invariant: Balance reverted by exactly 2000 once (from 3000 to 5000), not double reverted
      const bAfter = await app.db.query<{ balance_minor: string; paid_minor: string }>(
        'SELECT balance_minor, paid_minor FROM bookings WHERE id = $1',
        [bookingId],
      );
      expect(Number(bAfter.rows[0].balance_minor)).toBe(5000);
      expect(Number(bAfter.rows[0].paid_minor)).toBe(1000);
    });
  });

  // ===========================================================================
  // 7. Reconciler / Crash Recovery (T-029)
  // ===========================================================================
  describe('Reconciler / Crash Recovery (T-029)', () => {
    it('T-029: reconciler detects orphaned payment intent after crash, flags discrepancy and raises alert', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Simulate crash: PSP captured money, but server died before linking booking
      const orphanRes = await app.db.query<{ id: string }>(
        `INSERT INTO payment_intents (
           tenant_id, venue_id, provider, provider_ref, idempotency_key,
           amount_minor, currency, status, metadata, booking_id, group_booking_id
         ) VALUES ($1, $2, 'sandbox', 'pi_crash_orphan_999', 'idem-crash-orphan', 8000, 'RON', 'CAPTURED', '{}', NULL, NULL)
         RETURNING id`,
        [venue.tenantId, venue.venueId],
      );
      const orphanIntentId = orphanRes.rows[0].id;

      // Run daily financial reconciler
      const reportRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${venue.venueId}/reconciliation/daily?date=${today}`,
        { headers: { cookie: venue.manager.cookie } },
      );

      expect(reportRes.status).toBe(200);
      const report = reportRes.json as any;

      // Invariant: Reconciler flags discrepancy due to orphan captured intent
      expect(report.status).toBe('DISCREPANCY_FLAGGED');
      expect(report.discrepancy_count).toBeGreaterThanOrEqual(1);

      const orphanAnomaly = report.anomalies.find(
        (a: any) => a.type === 'ORPHAN_INTENT' && a.details?.intent_id === orphanIntentId,
      );
      expect(orphanAnomaly).toBeTruthy();
      expect(orphanAnomaly.details.intent_id).toBe(orphanIntentId);

      // Invariant: Alert created in reconciliation_alerts table
      const alerts = await app.db.query<{ alert_type: string; severity: string }>(
        "SELECT alert_type, severity FROM reconciliation_alerts WHERE venue_id = $1 AND alert_type = 'ORPHAN_INTENT'",
        [venue.venueId],
      );
      expect(alerts.rowCount).toBeGreaterThanOrEqual(1);
    });
  });
});
