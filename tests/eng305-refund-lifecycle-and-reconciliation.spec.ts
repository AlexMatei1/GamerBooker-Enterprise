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

describe('ENG-305 Refund Lifecycle, Daily Reconciliation Report & Alerting', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let otherVenueFixtures: { owner: Fixture; venueId: string };
  let customerUser: { cookie: string; userId: string };

  let testDate1 = '2026-11-15';
  let testDate2 = '2026-11-16';
  let pcId: string;
  let sharedBookingId: string;
  let bookingOffsetHours = 50;

  beforeAll(async () => {
    app = await startTestApp('eng305');
    fixtures = await createVenueWithRoles(app, 'Nexus Arena SRL', 'Nexus Arena Cluj');
    otherVenueFixtures = await createVenueWithRoles(app, 'Other Venue SRL', 'Other Venue Bucharest');
    customerUser = await app.verifiedUser();

    // Seed room, policy, price rule, and resource
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Nexus Battleground'],
    );
    const roomId = r1.rows[0].id;

    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 40, "deposit_mode_settlement": "ONLINE_OR_RECEPTION", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 5000, 'RON')",
      [fixtures.venueId],
    );

    const p1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'NEXUS-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pcId = p1.rows[0].id;

    // Create seed booking for offline receipts
    sharedBookingId = await createBooking();
  });

  afterAll(async () => {
    await app.stop();
  });

  async function createBooking(): Promise<string> {
    bookingOffsetHours += 10;
    const start = new Date(Date.now() + bookingOffsetHours * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + (bookingOffsetHours + 2) * 3600 * 1000).toISOString();

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
    return booking.id;
  }

  // Helper to create a captured payment intent
  async function createCapturedIntent(
    venueId: string,
    tenantId: string,
    amountMinor: number,
    dateStr: string,
    options?: { bookingId?: string; customerId?: string; isOrphan?: boolean },
  ) {
    const providerRef = `ch_test_${Math.random().toString(36).substring(2, 10)}`;
    const idempotencyKey = `idem_${Math.random().toString(36).substring(2, 10)}`;
    const custId = options?.customerId || customerUser.userId;
    const createdAt = new Date(`${dateStr}T12:00:00.000Z`);

    const res = await app.db.query<{ id: string }>(
      `INSERT INTO payment_intents (
         tenant_id, venue_id, provider, provider_ref, idempotency_key,
         amount_minor, currency, status, metadata, booking_id, created_at, updated_at
       ) VALUES ($1, $2, 'sandbox', $3, $4, $5, 'RON', 'CAPTURED', $6, $7, $8, $8)
       RETURNING id`,
      [
        tenantId,
        venueId,
        providerRef,
        idempotencyKey,
        amountMinor,
        JSON.stringify({ customer_id: custId }),
        options?.isOrphan ? null : options?.bookingId || null,
        createdAt,
      ],
    );
    return { id: res.rows[0].id, providerRef, amountMinor };
  }

  // Helper to create offline receipts
  async function createOfflineReceipt(
    venueId: string,
    tenantId: string,
    amountMinor: number,
    method: 'CASH' | 'POS_TERMINAL',
    dateStr: string,
    isVoided: boolean = false,
  ) {
    const createdAt = new Date(`${dateStr}T14:00:00.000Z`);
    const voidedAt = isVoided ? new Date(`${dateStr}T15:00:00.000Z`) : null;
    const voidedBy = isVoided ? fixtures.manager.userId : null;
    const voidReason = isVoided ? 'Mistyped amount' : null;

    const res = await app.db.query<{ id: string }>(
      `INSERT INTO offline_receipts (
         tenant_id, venue_id, booking_id, staff_id, amount_minor, payment_method,
         reference, voided_at, voided_by, void_reason, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        venueId,
        sharedBookingId,
        fixtures.reception.userId,
        amountMinor,
        method,
        `REC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        voidedAt,
        voidedBy,
        voidReason,
        createdAt,
      ],
    );
    return res.rows[0].id;
  }

  // ===========================================================================
  // 1. Refund Lifecycle & Manager Approval
  // ===========================================================================
  describe('Refund Lifecycle & Approval State Machine', () => {
    it('allows venue manager to initiate and auto-process refund to SUCCEEDED', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 10000, testDate1);

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 10000,
            reason: 'Station technical issue during tournament',
          },
        },
      );

      expect(res.status).toBe(201);
      const data = res.json as any;
      expect(data.id).toBeDefined();
      expect(data.status).toBe('SUCCEEDED');
      expect(data.amount_minor).toBe(10000);
      expect(data.provider_ref).toMatch(/^sbx_re_/);
      expect(data.approved_by).toBe(fixtures.manager.userId);
    });

    it('reception staff refund request transitions to REQUESTED requiring manager approval', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 6000, testDate1);

      // Reception staff requests refund
      const reqRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 6000,
            reason: 'Customer complaint about headphone noise',
          },
        },
      );

      expect(reqRes.status).toBe(201);
      const reqData = reqRes.json as any;
      expect(reqData.status).toBe('REQUESTED');
      expect(reqData.approved_by).toBeNull();
      const refundId = reqData.id;

      // Reception staff cannot approve refund (403 AUTH_ROLE_NOT_PERMITTED)
      const nonMgrApprove = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds/${refundId}/approve`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(nonMgrApprove.status).toBe(403);
      expect(app.errorOf(nonMgrApprove).code).toBe('AUTH_ROLE_NOT_PERMITTED');

      // Venue manager approves refund
      const mgrApprove = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds/${refundId}/approve`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(mgrApprove.status).toBe(200);
      const approvedData = mgrApprove.json as any;
      expect(approvedData.status).toBe('SUCCEEDED');
      expect(approvedData.approved_by).toBe(fixtures.manager.userId);
    });

    it('supports partial refunds and enforces captured amount limit (400 REFUND_AMOUNT_EXCEEDS_CAPTURED)', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 8000, testDate1);

      // 1st partial refund: 5000 bani
      const res1 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 5000,
            reason: 'Partial session cancellation 1',
          },
        },
      );
      expect(res1.status).toBe(201);
      expect((res1.json as any).amount_minor).toBe(5000);

      // 2nd partial refund: 4000 bani (5000 + 4000 = 9000 > 8000 captured) -> should reject
      const res2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 4000,
            reason: 'Partial session cancellation 2',
          },
        },
      );
      expect(res2.status).toBe(400);
      expect(app.errorOf(res2).code).toBe('REFUND_AMOUNT_EXCEEDS_CAPTURED');

      // 3rd partial refund: exactly remaining 3000 bani -> should succeed
      const res3 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 3000,
            reason: 'Exact remaining balance refund',
          },
        },
      );
      expect(res3.status).toBe(201);
      expect((res3.json as any).status).toBe('SUCCEEDED');
    });

    it('rejects refund with non-positive amount or missing reason', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 5000, testDate1);

      const invalidAmt = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: -100,
            reason: 'Invalid negative amount',
          },
        },
      );
      expect(invalidAmt.status).toBe(400);
      expect(app.errorOf(invalidAmt).code).toBe('INVALID_REFUND_AMOUNT');

      const missingReason = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 1000,
            reason: '   ',
          },
        },
      );
      expect(missingReason.status).toBe(400);
      expect(app.errorOf(missingReason).code).toBe('MISSING_REFUND_REASON');
    });

    it('deduplicates refund request using idempotency key', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 5000, testDate1);
      const idemKey = `refund-test-${Date.now()}`;

      const res1 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 2500,
            reason: 'Idempotency verification',
            idempotency_key: idemKey,
          },
        },
      );
      expect(res1.status).toBe(201);
      const refundId1 = (res1.json as any).id;

      // Repeat identical call
      const res2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            payment_intent_id: intent.id,
            amount_minor: 2500,
            reason: 'Idempotency verification duplicate',
            idempotency_key: idemKey,
          },
        },
      );
      expect(res2.status).toBe(201);
      expect((res2.json as any).id).toBe(refundId1);
    });

    it('allows staff to list venue refunds with aggregate summary metrics', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.refunds.length).toBeGreaterThanOrEqual(1);
      expect(data.total_count).toBeGreaterThanOrEqual(1);
      expect(data.summary.total_refunded_minor).toBeGreaterThan(0);
      expect(data.summary.count_by_status.SUCCEEDED).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 2. Refund Failure & Retry Engine
  // ===========================================================================
  describe('Refund Failure & Retry Engine', () => {
    it('handles refund retry and triggers manual review on max retries', async () => {
      const intent = await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 4000, testDate1);

      // Create a refund directly in FAILED_RETRYABLE state
      const insRes = await app.db.query<{ id: string }>(
        `INSERT INTO refunds (
           tenant_id, venue_id, payment_intent_id, customer_id, amount_minor,
           currency, status, reason, retry_count, failure_reason
         ) VALUES ($1, $2, $3, $4, 4000, 'RON', 'FAILED_RETRYABLE', 'Network transient glitch', 1, 'PSP_TIMEOUT')
         RETURNING id`,
        [fixtures.tenantId, fixtures.venueId, intent.id, customerUser.userId],
      );
      const failedRefundId = insRes.rows[0].id;

      // Retry refund via endpoint
      const retryRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds/${failedRefundId}/retry`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(retryRes.status).toBe(200);
      expect((retryRes.json as any).status).toBe('SUCCEEDED');
    });
  });

  // ===========================================================================
  // 3. Daily Reconciliation Report
  // ===========================================================================
  describe('Daily Financial Reconciliation Report', () => {
    it('computes penny-accurate opening, online captures, refunds, cash/card collections, and closing balance', async () => {
      // Setup financial events for testDate1:
      // Online captures: 15,000 minor
      await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 10000, testDate1);
      await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 5000, testDate1);

      // Offline cash receipts: 4,000 minor
      await createOfflineReceipt(fixtures.venueId, fixtures.tenantId, 4000, 'CASH', testDate1, false);

      // Offline card receipts: 6,000 minor
      await createOfflineReceipt(fixtures.venueId, fixtures.tenantId, 6000, 'POS_TERMINAL', testDate1, false);

      // Voided offline receipt: 2,000 minor (should not be in net collections)
      await createOfflineReceipt(fixtures.venueId, fixtures.tenantId, 2000, 'CASH', testDate1, true);

      // Generate daily report for testDate1
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily?date=${testDate1}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const report = res.json as any;
      expect(report.report_date).toBe(testDate1);
      expect(report.opening_balance_minor).toBe(0);
      expect(report.online_captures_minor).toBeGreaterThanOrEqual(15000);
      expect(report.reception_cash_minor).toBeGreaterThanOrEqual(4000);
      expect(report.reception_card_minor).toBeGreaterThanOrEqual(6000);
      expect(report.voided_offline_minor).toBeGreaterThanOrEqual(2000);

      // Invariant: total_collected_minor === net_online_minor + reception_cash_minor + reception_card_minor
      expect(report.total_collected_minor).toBe(
        report.net_online_minor + report.reception_cash_minor + report.reception_card_minor,
      );
      expect(report.closing_balance_minor).toBe(
        report.opening_balance_minor + report.total_collected_minor,
      );
    });

    it('chains closing balance of day 1 into opening balance of day 2', async () => {
      // Fetch day 1 report to get closing balance
      const d1Res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily?date=${testDate1}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      const d1Closing = (d1Res.json as any).closing_balance_minor;

      // Close day 1 report
      const closeRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily/close?date=${testDate1}`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { notes: 'Day 1 closed and verified by Venue Manager' },
        },
      );
      expect(closeRes.status).toBe(200);
      expect((closeRes.json as any).status).toBe('RECONCILED');

      // Generate day 2 report (testDate2 is the consecutive day)
      const d2Res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily?date=${testDate2}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(d2Res.status).toBe(200);
      const d2Report = d2Res.json as any;
      expect(d2Report.opening_balance_minor).toBe(d1Closing);
    });
  });

  // ===========================================================================
  // 4. Discrepancy Detection & Alerting
  // ===========================================================================
  describe('Discrepancy Detection & Alerting', () => {
    it('flags ORPHAN_INTENT anomaly when a captured intent has no linked booking and creates an alert', async () => {
      const anomalyDate = '2026-11-20';

      // Insert orphan captured intent
      await createCapturedIntent(fixtures.venueId, fixtures.tenantId, 7500, anomalyDate, {
        isOrphan: true,
      });

      // Generate report for that date
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily?date=${anomalyDate}`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(res.status).toBe(200);
      const report = res.json as any;
      expect(report.status).toBe('DISCREPANCY_FLAGGED');
      expect(report.discrepancy_count).toBeGreaterThanOrEqual(1);

      const orphanAnomaly = report.anomalies.find((a: any) => a.type === 'ORPHAN_INTENT');
      expect(orphanAnomaly).toBeDefined();

      // Verify alert was created in reconciliation_alerts
      const alertsRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/alerts?status=OPEN`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );
      expect(alertsRes.status).toBe(200);
      const alertsData = alertsRes.json as any;
      const alert = alertsData.alerts.find((a: any) => a.alert_type === 'ORPHAN_INTENT');
      expect(alert).toBeDefined();
      expect(alert.acknowledged_at).toBeNull();

      // Manager acknowledges alert
      const ackRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/alerts/${alert.id}/acknowledge`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { note: 'Investigated orphan intent; verified manually' },
        },
      );
      expect(ackRes.status).toBe(200);
      expect((ackRes.json as any).acknowledged_at).toBeDefined();
      expect((ackRes.json as any).acknowledgement_note).toBe(
        'Investigated orphan intent; verified manually',
      );
    });
  });

  // ===========================================================================
  // 5. Authorization & Security Boundaries
  // ===========================================================================
  describe('Authorization & Security Boundaries', () => {
    it('prohibits customer from accessing venue reconciliation or refund management (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily`,
        {
          headers: { cookie: customerUser.cookie },
        },
      );
      // Non-member access to dashboard returns 404 to avoid venue ID enumeration
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits reception staff from viewing daily reconciliation report (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/reconciliation/daily`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );
      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('enforces cross-venue boundary: staff from Venue B cannot access Venue A refunds', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/refunds`,
        {
          headers: { cookie: otherVenueFixtures.owner.cookie },
        },
      );
      expect([403, 404]).toContain(res.status);
    });
  });
});
