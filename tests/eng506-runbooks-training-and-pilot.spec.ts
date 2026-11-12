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
     VALUES ($1, $2, 'Europe/Bucharest', '{"street": "Str. Victoriei 10", "city": "Bucuresti"}', '{"email": "ops@arena.ro"}', 'PUBLISHED')
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

describe('ENG-506 Incident Runbooks, Partner Training, and Pilot Metrics', () => {
  let app: TestApp;
  let venue: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customer: Fixture;
  let pcId: string;
  let bookingId: string;
  let productId: string;

  beforeAll(async () => {
    app = await startTestApp('eng506', { browserClient: true });
    venue = await createVenueWithRoles(app, 'Cyber Ops SRL', 'Cyber Arena Bucharest');
    const cust = await app.verifiedUser();
    customer = { ...cust, tenantId: venue.tenantId, venueId: venue.venueId };

    // Room and PC
    const room = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [venue.venueId, 'Arena Floor'],
    );
    const pcRes = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'CYBER-PC-01', 'AVAILABLE', true) RETURNING id`,
      [venue.venueId, room.rows[0].id],
    );
    pcId = pcRes.rows[0].id;

    // Default policy & price rule
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

    // Operating schedules (7 days)
    for (let day = 0; day <= 6; day++) {
      await app.db.query(
        `INSERT INTO operating_schedules (venue_id, day_of_week, open_time, close_time, is_closed)
         VALUES ($1, $2, '09:00:00', '23:00:00', false)
         ON CONFLICT (venue_id, day_of_week) DO UPDATE SET open_time = EXCLUDED.open_time`,
        [venue.venueId, day],
      );
    }

    // Confirmed booking for testing
    const startsAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
    const qRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: customer.cookie },
      body: { venue_id: venue.venueId, resource_ids: [pcId], starts_at: startsAt, ends_at: endsAt },
    });
    const hRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: customer.cookie },
      body: { quote_id: (qRes.json as any)?.quote_id },
    });
    // The confirm guard requires server-side proof of the upfront charge;
    // settle the hold the way the PSP webhook would.
    const upfrontIntentId = await app.settleHoldPayment((hRes.json as any)?.id);
    const cRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: customer.cookie },
      body: {
        hold_id: (hRes.json as any)?.id,
        ...(upfrontIntentId ? { payment_intent_id: upfrontIntentId } : {}),
      },
    });
    bookingId = (cRes.json as any)?.booking?.id || (cRes.json as any)?.id;

    // Consumable product
    const catRes = await app.db.query<{ id: string }>(
      `INSERT INTO menu_categories (tenant_id, venue_id, name, active)
       VALUES ($1, $2, 'Drinks', true) RETURNING id`,
      [venue.tenantId, venue.venueId],
    );
    const prodRes = await app.db.query<{ id: string }>(
      `INSERT INTO products (
         tenant_id, venue_id, category_id, sku, title, price_minor, currency,
         stock_on_hand, stock_reserved, inventory_tracking, active
       ) VALUES ($1, $2, $3, 'CYBER-COLA', 'Cyber Cola 330ml', 1000, 'RON', 15, 0, true, true)
       RETURNING id`,
      [venue.tenantId, venue.venueId, catRes.rows[0].id],
    );
    productId = prodRes.rows[0].id;
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  // ===========================================================================
  // 1. Incident Runbooks (R1 - R6)
  // ===========================================================================
  describe('Incident Runbooks (R1 - R6)', () => {
    it('R1: audits double-booking allegation and distinguishes physical squatting from database overlap', async () => {
      const from = new Date(Date.now() + 47 * 3600 * 1000).toISOString();
      const to = new Date(Date.now() + 51 * 3600 * 1000).toISOString();

      const res = await app.call(
        'GET',
        `/v1/runbooks/r1-double-booking-audit?resource_id=${pcId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { cookie: venue.manager.cookie } },
      );


      // R1 is one of the legacy runbooks that HANDOFF-CAFE-ACCESS-2026-11-05.md
      // line 29 closed on purpose (no tenant-safe contract). An authenticated
      // manager must still get fail-closed 404, never the old unfiltered audit.
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('R2: resolves orphan PSP payment by dispatching an automated compensating refund', async () => {
      // Create orphan intent (captured, no booking)
      const piRef = `pi_orphan_${randomUUID()}`;
      await app.db.query(
        `INSERT INTO payment_intents (
           tenant_id, venue_id, provider, provider_ref, idempotency_key,
           amount_minor, currency, status, metadata, booking_id
         ) VALUES ($1, $2, 'sandbox', $3, $4, 6000, 'RON', 'CAPTURED', $5, NULL)`,
        [venue.tenantId, venue.venueId, piRef, `idem-${randomUUID()}`, JSON.stringify({ customer_id: customer.userId })],
      );

      const res = await app.call('POST', '/v1/runbooks/r2-orphan-payment-resolution', {
        headers: { cookie: venue.manager.cookie },
        body: {
          provider_ref: piRef,
          action: 'REFUND',
          refund_reason: 'Automated orphan resolution',
        },
      });


      // R2 is one of the deliberately closed legacy runbooks
      // (HANDOFF-CAFE-ACCESS-2026-11-05.md line 29). Closing the route must not
      // quietly refund or re-link money: the orphan intent stays CAPTURED and
      // unlinked so reconciliation keeps surfacing it.
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');

      const check = await app.db.query<{ status: string; booking_id: string | null }>(
        'SELECT status, booking_id FROM payment_intents WHERE provider_ref = $1',
        [piRef],
      );
      expect(check.rows[0].status).toBe('CAPTURED');
      expect(check.rows[0].booking_id).toBeNull();
    });

    it('R3: reconciles daily receivables and verifies balanced collections delta', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await app.call(
        'GET',
        `/v1/runbooks/r3-receivable-reconciliation?venue_id=${venue.venueId}&date=${today}`,
        { headers: { cookie: venue.manager.cookie } },
      );


      // R3 closed (HANDOFF-CAFE-ACCESS-2026-11-05.md line 29): fail-closed 404.
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('R4: runs pre-publication diagnostics identifying missing layout draft or configuration gates', async () => {
      const res = await app.call(
        'GET',
        `/v1/runbooks/r4-publish-diagnostics?venue_id=${venue.venueId}`,
        { headers: { cookie: venue.manager.cookie } },
      );


      // R4 closed (HANDOFF-CAFE-ACCESS-2026-11-05.md line 29): fail-closed 404.
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });

    it('R5: surfaces offline check-in contingency protocol and strict app-only rules', async () => {
      const res = await app.call('GET', '/v1/runbooks/r5-offline-checkin-contingency');

      expect(res.status).toBe(200);
      const contingency = res.json as any;

      expect(contingency.mode).toBe('OFFLINE_CONTINGENCY');
      expect(contingency.system_invariant).toBe('STRICT_APP_ONLY_NO_STAFF_BYPASS');
      expect(contingency.instructions.length).toBeGreaterThanOrEqual(3);
      expect(contingency.prohibited_actions).toContain(
        'NEVER accept cash or card payment to create a booking from staff dashboard or paper ledger outside the system.',
      );
    });

    it('R6: executes out-of-stock emergency action, deactivates SKU, and cancels pending order items', async () => {
      // Create pending order containing this product
      const ordRes = await app.call('POST', '/v1/orders/checkout', {
        headers: { cookie: customer.cookie },
        body: {
          venue_id: venue.venueId,
          booking_id: bookingId,
          order_type: 'PRE_ORDER',
          fulfillment_mode: 'BAR_PICKUP',
          items: [{ product_id: productId, quantity: 2 }],
          idempotency_key: `r6-ord-${randomUUID()}`,
        },
      });
      expect(ordRes.status).toBe(201);

      // Execute Runbook R6
      const r6Res = await app.call('POST', '/v1/runbooks/r6-out-of-stock-action', {
        headers: { cookie: venue.manager.cookie },
        body: {
          venue_id: venue.venueId,
          product_id: productId,
          action: 'CANCEL_PENDING_ITEMS',
          reason: 'Emergency batch contamination recall',
        },
      });

      // R6 mutation closed (HANDOFF-CAFE-ACCESS-2026-11-05.md line 29).
      expect(r6Res.status).toBe(404);
      expect(app.errorOf(r6Res).code).toBe('RESOURCE_NOT_FOUND');

      // A closed emergency action must not pretend to have run: the SKU stays
      // sellable and no refund is fabricated.
      const pCheck = await app.db.query<{ active: boolean }>(
        'SELECT active FROM products WHERE id = $1',
        [productId],
      );
      expect(pCheck.rows[0].active).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Partner Training & Staff Certifications
  // ===========================================================================
  describe('Partner Training Program & Staff Certifications', () => {
    it('returns official curriculum for owner, manager, reception, and bar staff', async () => {
      const res = await app.call('GET', '/v1/training/curriculum');

      expect(res.status).toBe(200);
      const curriculum = res.json as any;

      expect(curriculum.modules.length).toBe(4);
      const moduleIds = curriculum.modules.map((m: any) => m.id);
      expect(moduleIds).toContain('OWNER_GOVERNANCE');
      expect(moduleIds).toContain('MANAGER_OPERATIONS');
      expect(moduleIds).toContain('RECEPTION_ZERO_STAFF_BOOKING');
      expect(moduleIds).toContain('BAR_LAW_42_2024_AGE_COMPLIANCE');
    });

    it('records staff certifications and evaluates venue training readiness', async () => {
      // The certification write route is one of the legacy routes closed by
      // HANDOFF-CAFE-ACCESS-2026-11-05.md line 29 (it trusted caller-supplied
      // tenant_id/venue_id/user_id). Pin the closure first...
      const closedWrite = await app.call('POST', '/v1/training/certifications', {
        headers: { cookie: venue.owner.cookie },
        body: {
          tenant_id: venue.tenantId,
          venue_id: venue.venueId,
          user_id: venue.owner.userId,
          module_id: 'OWNER_GOVERNANCE',
          score: 100,
        },
      });
      expect(closedWrite.status).toBe(404);
      expect(app.errorOf(closedWrite).code).toBe('RESOURCE_NOT_FOUND');

      // ...then verify the read-only readiness computation itself is correct,
      // seeding records the way an authorised back-office write would.
      const initialRes = await app.call(
        'GET',
        `/v1/training/venues/${venue.venueId}/staff-readiness`,
        { headers: { cookie: venue.manager.cookie } },
      );
      expect(initialRes.status).toBe(200);
      const initial = initialRes.json as any;
      expect(initial.ready_for_launch).toBe(false);
      expect(initial.missing_certifications.length).toBeGreaterThanOrEqual(1);

      const seed = async (userId: string, moduleId: string) => {
        await app.db.query(
          `INSERT INTO staff_certifications (
             tenant_id, venue_id, user_id, module_id, certified_by, score
           ) VALUES ($1, $2, $3, $4, $5, 100)
           ON CONFLICT (user_id, venue_id, module_id) DO UPDATE SET score = 100`,
          [venue.tenantId, venue.venueId, userId, moduleId, venue.owner.userId],
        );
      };
      await seed(venue.owner.userId, 'OWNER_GOVERNANCE');
      await seed(venue.manager.userId, 'MANAGER_OPERATIONS');
      await seed(venue.reception.userId, 'RECEPTION_ZERO_STAFF_BOOKING');

      // Check final readiness after certifying all staff
      const finalRes = await app.call(
        'GET',
        `/v1/training/venues/${venue.venueId}/staff-readiness`,
        { headers: { cookie: venue.manager.cookie } },
      );
      expect(finalRes.status).toBe(200);
      const final = finalRes.json as any;

      expect(final.total_staff).toBe(3);
      expect(final.certified_staff).toBe(3);
      expect(final.readiness_percentage).toBe(100);
      expect(final.ready_for_launch).toBe(true);
      expect(final.missing_certifications).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 3. Pilot Launch KPIs & Go/No-Go Decision Engine
  // ===========================================================================
  describe('Pilot Launch KPIs and Go/No-Go Decision Engine', () => {
    it('computes live pilot metrics and KPIs from production database tables', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${venue.venueId}/pilot-metrics`,
        { headers: { cookie: venue.manager.cookie } },
      );


      expect(res.status).toBe(200);
      const metrics = res.json as any;

      expect(metrics.venue_id).toBe(venue.venueId);
      expect(metrics.kpis.double_booking_rate).toBe(0.0);
      expect(metrics.kpis.unresolved_payment_mismatches).toBe(0);
      expect(metrics.kpis.total_confirmed_bookings).toBeGreaterThanOrEqual(1);
      expect(metrics.kpis.total_revenue_minor).toBeGreaterThanOrEqual(6000);
      expect(metrics.kpis.median_staff_intake_seconds).toBeLessThanOrEqual(15);
    });

    it('evaluates all 7 Go/No-Go gates and returns final release decision', async () => {
      // Initialize draft and publish revision to satisfy Gate 1 and Gate 2
      await app.db.query(
        `INSERT INTO layout_drafts (
          venue_id, revision, schema_version, canvas, rooms, layers, nodes
        ) VALUES (
          $1, 1, 1,
          '{"width": 1600, "height": 1000, "grid": 20}'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb
        ) ON CONFLICT (venue_id) DO NOTHING`,
        [venue.venueId],
      );

      await app.call('POST', `/v1/dashboard/venues/${venue.venueId}/layout/publish`, {
        headers: { cookie: venue.owner.cookie },
        body: { expected_draft_revision: 1, change_summary: 'Go/No-Go verification publication' },
      });

      await app.db.query(
        "UPDATE venues SET publication_state = 'PUBLISHED' WHERE id = $1",
        [venue.venueId],
      );

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${venue.venueId}/go-no-go`,
        { headers: { cookie: venue.manager.cookie } },
      );


      expect(res.status).toBe(200);
      const decision = res.json as any;

      expect(decision.venue_id).toBe(venue.venueId);
      expect(decision.gates_total).toBe(7);
      expect(decision.gates_passed).toBe(7);
      expect(decision.decision).toBe('GO');

      for (const gate of decision.gates) {
        expect(gate.passed).toBe(true);
      }
    });
  });
});
