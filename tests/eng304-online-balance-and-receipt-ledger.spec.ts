import { startTestApp, type TestApp } from './support/auth-harness';

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

describe('ENG-304 Online Remaining Balance & Reception Receipt Ledger', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customerUser: { cookie: string; userId: string };
  let otherCustomer: { cookie: string; userId: string };

  let pcId: string;
  let defaultPolicyId: string;
  let receptionOnlyPolicyId: string;
  let bookingOffsetHours = 100;

  beforeAll(async () => {
    app = await startTestApp('eng304');
    fixtures = await createVenueWithRoles(app, 'Apex Gaming SRL', 'Apex Arena Timisoara');

    customerUser = await app.verifiedUser();
    otherCustomer = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Apex Battleground'],
    );
    const roomId = r1.rows[0].id;

    // Policy 1: Default 40% deposit, ONLINE_OR_RECEPTION allowed
    const pol1 = await app.db.query<{ id: string }>(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Online Or Reception Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 40, "deposit_mode_settlement": "ONLINE_OR_RECEPTION", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')
       RETURNING id`,
      [fixtures.venueId],
    );
    defaultPolicyId = pol1.rows[0].id;

    // Policy 2: RECEPTION_ONLY settlement
    const pol2 = await app.db.query<{ id: string }>(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Reception Only Policy', false, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 50, "deposit_mode_settlement": "RECEPTION_ONLY", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')
       RETURNING id`,
      [fixtures.venueId],
    );
    receptionOnlyPolicyId = pol2.rows[0].id;

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 5000, 'RON')",
      [fixtures.venueId],
    );

    const p1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'APEX-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pcId = p1.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  async function createDepositBooking(customPolicyId?: string) {
    bookingOffsetHours += 10;
    const start = new Date(Date.now() + bookingOffsetHours * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + (bookingOffsetHours + 2) * 3600 * 1000).toISOString();

    await app.db.query(
      'UPDATE policy_profiles SET is_default = false WHERE venue_id = $1',
      [fixtures.venueId],
    );
    await app.db.query(
      'UPDATE policy_profiles SET is_default = true WHERE id = $1',
      [customPolicyId || defaultPolicyId],
    );

    const qRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: customerUser.cookie },
      body: {
        venue_id: fixtures.venueId,
        resource_ids: [pcId],
        starts_at: start,
        ends_at: end,
      },
    });
    expect(qRes.status).toBe(201);
    const quote = qRes.json as any;

    const holdRes = await app.call('POST', '/v1/holds', {
      headers: { cookie: customerUser.cookie },
      body: { quote_id: quote.quote_id },
    });
    expect(holdRes.status).toBe(201);
    const hold = holdRes.json as any;

    const confirmRes = await app.call('POST', '/v1/bookings/confirm', {
      headers: { cookie: customerUser.cookie },
      body: { hold_id: hold.id },
    });
    expect(confirmRes.status).toBe(201);
    const booking = (confirmRes.json as any).booking || (confirmRes.json as any);

    return { booking, quote, hold };
  }

  // ===========================================================================
  // 1. Online Remaining Balance Payment (/v1/bookings/:id/pay-balance-online)
  // ===========================================================================
  describe('Online Remaining Balance Payment', () => {
    it('creates a PSP payment intent for outstanding balance under ONLINE_OR_RECEPTION policy', async () => {
      const { booking } = await createDepositBooking(defaultPolicyId);
      expect(booking.balance_minor).toBeGreaterThan(0);

      const res = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie, 'x-request-id': 'req-bal-online-1' },
      });

      expect(res.status).toBe(201);
      const data = res.json as any;
      expect(data.intent_id).toBeDefined();
      expect(data.provider_ref).toMatch(/^sbx_pi_/);
      expect(data.amount_minor).toBe(booking.balance_minor);
      expect(data.currency).toBe('RON');

      // Verify audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'ONLINE_BALANCE_INTENT_CREATED'",
        [booking.id],
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('captures online balance payment and updates booking balance to zero', async () => {
      const { booking } = await createDepositBooking(defaultPolicyId);
      const initialBalance = booking.balance_minor;
      const initialPaid = booking.paid_minor;

      const intentRes = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie },
      });
      const providerRef = (intentRes.json as any).provider_ref;

      // Capture payment
      const capRes = await app.call('POST', '/v1/payments/capture-balance', {
        body: { provider_ref: providerRef },
      });

      expect(capRes.status).toBe(200);
      const capResult = capRes.json as any;
      expect(capResult.applied_minor).toBe(initialBalance);
      expect(capResult.new_balance_minor).toBe(0);

      // Verify updated booking in DB
      const bCheck = await app.db.query<{ paid_minor: string; balance_minor: string }>(
        'SELECT paid_minor, balance_minor FROM bookings WHERE id = $1',
        [booking.id],
      );
      expect(Number(bCheck.rows[0].balance_minor)).toBe(0);
      expect(Number(bCheck.rows[0].paid_minor)).toBe(initialPaid + initialBalance);
    });

    it('rejects online balance payment when booking balance is already zero (400 NO_OUTSTANDING_BALANCE)', async () => {
      const { booking } = await createDepositBooking(defaultPolicyId);

      // Pay full balance
      const intentRes = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie },
      });
      await app.call('POST', '/v1/payments/capture-balance', {
        body: { provider_ref: (intentRes.json as any).provider_ref },
      });

      // Try paying again
      const retryRes = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie },
      });

      expect(retryRes.status).toBe(400);
      expect(app.errorOf(retryRes).code).toBe('NO_OUTSTANDING_BALANCE');
    });

    it('rejects online balance payment if venue policy requires RECEPTION_ONLY settlement', async () => {
      const { booking } = await createDepositBooking(receptionOnlyPolicyId);

      const res = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie },
      });

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('ONLINE_SETTLEMENT_NOT_ALLOWED');
    });

    it('prohibits other customer from paying balance for a booking they do not own (404/403)', async () => {
      const { booking } = await createDepositBooking(defaultPolicyId);

      const res = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: otherCustomer.cookie },
      });

      expect([403, 404]).toContain(res.status);
    });
  });

  // ===========================================================================
  // 2. Reception Offline Receipt Ledger & Filtering
  // ===========================================================================
  describe('Reception Offline Receipt Ledger & Filtering', () => {
    let booking1Id: string;
    let booking2Id: string;
    let receipt1Id: string;
    let receipt2Id: string;

    beforeAll(async () => {
      const b1 = await createDepositBooking(defaultPolicyId);
      const b2 = await createDepositBooking(defaultPolicyId);
      booking1Id = b1.booking.id;
      booking2Id = b2.booking.id;

      // Staff pays partial balance via CASH
      const r1Res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/bookings/${booking1Id}/pay-balance`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            amount_minor: 2000,
            payment_method: 'CASH',
            reference: 'FISCAL-REC-001',
            notes: 'Desk cash payment',
          },
        },
      );
      receipt1Id = (r1Res.json as any).id;

      // Staff pays balance via POS_TERMINAL
      const r2Res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/bookings/${booking2Id}/pay-balance`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            amount_minor: 3500,
            payment_method: 'POS_TERMINAL',
            reference: 'POS-AUTH-98765',
            notes: 'Ingenico terminal slip',
          },
        },
      );
      receipt2Id = (r2Res.json as any).id;
    });

    it('allows staff to list receipt ledger with aggregated collection metrics', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.total_count).toBeGreaterThanOrEqual(2);
      expect(data.summary.total_collected_minor).toBeGreaterThanOrEqual(5500);
      expect(data.summary.cash_collected_minor).toBeGreaterThanOrEqual(2000);
      expect(data.summary.card_collected_minor).toBeGreaterThanOrEqual(3500);
      expect(data.summary.voided_count).toBe(0);

      // Verify item details
      const r1 = data.receipts.find((r: any) => r.id === receipt1Id);
      expect(r1).toBeDefined();
      expect(r1.amount_minor).toBe(2000);
      expect(r1.payment_method).toBe('CASH');
      expect(r1.booking_public_code).toMatch(/^GB-[A-Z0-9]+$/);
    });

    it('filters receipts by payment method', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts?payment_method=CASH`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;
      for (const r of data.receipts) {
        expect(r.payment_method).toBe('CASH');
      }
    });

    it('prohibits customer from accessing reception receipt ledger (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts`,
        {
          headers: { cookie: customerUser.cookie },
        },
      );

      // In accordance with VenueRoleGuard invariant: non-members receive 404 to avoid venue enumeration
      expect([403, 404]).toContain(res.status);
    });
  });

  // ===========================================================================
  // 3. Offline Receipt Voiding & Balance Reversion
  // ===========================================================================
  describe('Offline Receipt Voiding & Balance Reversion', () => {
    let targetBookingId: string;
    let targetReceiptId: string;
    const paymentAmount = 2500;

    beforeAll(async () => {
      const b = await createDepositBooking(defaultPolicyId);
      targetBookingId = b.booking.id;

      const rRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/bookings/${targetBookingId}/pay-balance`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            amount_minor: paymentAmount,
            payment_method: 'CASH',
            reference: 'FISCAL-VOID-TEST',
          },
        },
      );
      targetReceiptId = (rRes.json as any).id;
    });

    it('prevents reception staff from voiding receipt without manager authorization (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts/${targetReceiptId}/void`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { reason: 'Accidental entry by cashier' },
        },
      );

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('rejects voiding if reason is missing (400 MISSING_VOID_REASON)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts/${targetReceiptId}/void`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { reason: '   ' },
        },
      );

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('MISSING_VOID_REASON');
    });

    it('allows venue manager to void receipt, restoring outstanding balance to booking', async () => {
      const bBefore = await app.db.query<{ paid_minor: string; balance_minor: string }>(
        'SELECT paid_minor, balance_minor FROM bookings WHERE id = $1',
        [targetBookingId],
      );
      const paidBefore = Number(bBefore.rows[0].paid_minor);
      const balanceBefore = Number(bBefore.rows[0].balance_minor);

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts/${targetReceiptId}/void`,
        {
          headers: { cookie: fixtures.manager.cookie, 'x-request-id': 'req-void-rec-1' },
          body: { reason: 'Customer changed mind and will pay card' },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;
      expect(data.voided).toBe(true);
      expect(data.reverted_amount_minor).toBe(paymentAmount);
      expect(data.new_balance_minor).toBe(balanceBefore + paymentAmount);
      expect(data.new_paid_minor).toBe(paidBefore - paymentAmount);
      expect(data.void_reason).toBe('Customer changed mind and will pay card');

      // Verify DB booking balances reverted
      const bAfter = await app.db.query<{ paid_minor: string; balance_minor: string }>(
        'SELECT paid_minor, balance_minor FROM bookings WHERE id = $1',
        [targetBookingId],
      );
      expect(Number(bAfter.rows[0].balance_minor)).toBe(balanceBefore + paymentAmount);
      expect(Number(bAfter.rows[0].paid_minor)).toBe(paidBefore - paymentAmount);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'OFFLINE_RECEIPT_VOIDED'",
        [targetReceiptId],
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('rejects attempting to void an already voided receipt (409 RECEIPT_ALREADY_VOIDED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/receipts/${targetReceiptId}/void`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: { reason: 'Duplicate void attempt' },
        },
      );

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('RECEIPT_ALREADY_VOIDED');
    });
  });

  // ===========================================================================
  // 4. Concurrent Online Payment & Reception Settlement (Race / Overpayment Guard)
  // ===========================================================================
  describe('Concurrent Online & Reception Race Condition / Overpayment Guard', () => {
    it('refunds online capture when desk staff already collected balance in full', async () => {
      const { booking } = await createDepositBooking(defaultPolicyId);
      const balanceToPay = booking.balance_minor;

      // Customer generates online payment intent
      const intentRes = await app.call('POST', `/v1/bookings/${booking.id}/pay-balance-online`, {
        headers: { cookie: customerUser.cookie },
      });
      const providerRef = (intentRes.json as any).provider_ref;

      // Meanwhile, desk staff collects balance in full at the desk before PSP capture arrives!
      const deskRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/bookings/${booking.id}/pay-balance`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: {
            amount_minor: balanceToPay,
            payment_method: 'CASH',
            reference: 'RACE-SETTLED-DESK',
          },
        },
      );
      expect(deskRes.status).toBe(201);

      // Verify booking balance is now 0
      const bMid = await app.db.query<{ balance_minor: string }>(
        'SELECT balance_minor FROM bookings WHERE id = $1',
        [booking.id],
      );
      expect(Number(bMid.rows[0].balance_minor)).toBe(0);

      // Now online PSP capture arrives for the full balance!
      const capRes = await app.call('POST', '/v1/payments/capture-balance', {
        body: { provider_ref: providerRef },
      });

      expect(capRes.status).toBe(200);
      const capResult = capRes.json as any;
      expect(capResult.applied_minor).toBe(0); // 0 applied
      expect(capResult.refunded_minor).toBe(balanceToPay); // full amount refunded!
      expect(capResult.new_balance_minor).toBe(0);

      // Verify refund record created in refunds table
      const refundCheck = await app.db.query<{ reason: string; status: string; amount_minor: string }>(
        'SELECT reason, status, amount_minor FROM refunds WHERE booking_id = $1 AND reason = $2',
        [booking.id, 'BALANCE_ALREADY_SETTLED_OVERPAYMENT'],
      );
      expect(refundCheck.rowCount).toBe(1);
      expect(refundCheck.rows[0].status).toBe('SUCCEEDED');
      expect(Number(refundCheck.rows[0].amount_minor)).toBe(balanceToPay);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'ONLINE_BALANCE_REFUNDED_ALREADY_SETTLED'",
        [booking.id],
      );
      expect(auditRes.rowCount).toBe(1);
    });
  });
});
