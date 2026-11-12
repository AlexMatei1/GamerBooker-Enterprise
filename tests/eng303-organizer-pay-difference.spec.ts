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

describe('ENG-303 Organizer Pay-All & Pay-Difference Safety', () => {
  let app: TestApp;
  let fixtures: { venueId: string; tenantId: string };
  let organizer: { cookie: string; userId: string };
  let participant1: { cookie: string; userId: string };
  let participant2: { cookie: string; userId: string };
  let stranger: { cookie: string; userId: string };

  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;
  let bookingOffsetHours = 50;

  beforeAll(async () => {
    app = await startTestApp('eng303', { browserClient: true });
    fixtures = await createVenueWithRoles(app, 'Nexus Gaming SRL', 'Nexus Arena');

    organizer = await app.verifiedUser();
    participant1 = await app.verifiedUser();
    participant2 = await app.verifiedUser();
    stranger = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Nexus Main Room'],
    );
    const roomId = r1.rows[0].id;

    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 50, "deposit_mode_settlement": "ONLINE_OR_RECEPTION", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 4000, 'RON')",
      [fixtures.venueId],
    );

    const p1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'NEXUS-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc1Id = p1.rows[0].id;

    const p2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'NEXUS-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc2Id = p2.rows[0].id;

    const p3 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'NEXUS-03', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc3Id = p3.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  async function setupGroupBooking() {
    bookingOffsetHours += 10;
    const quoteStart = new Date(Date.now() + bookingOffsetHours * 3600 * 1000).toISOString();
    const quoteEnd = new Date(Date.now() + (bookingOffsetHours + 2) * 3600 * 1000).toISOString();

    const qRes = await app.call('POST', '/v1/quotes', {
      headers: { cookie: organizer.cookie },
      body: {
        venue_id: fixtures.venueId,
        resource_ids: [pc1Id, pc2Id, pc3Id],
        starts_at: quoteStart,
        ends_at: quoteEnd,
      },
    });
    expect(qRes.status).toBe(201);
    const quoteId = (qRes.json as any).quote_id;

    const gbRes = await app.call('POST', '/v1/group-bookings', {
      headers: { cookie: organizer.cookie },
      body: {
        quote_id: quoteId,
        mode: 'SPLIT_BY_PARTICIPANT',
        participants: [
          { email: 'p1@nexus.test' },
          { email: 'p2@nexus.test' },
        ],
      },
    });
    expect(gbRes.status).toBe(201);
    const gb = (gbRes.json as any).group_booking;

    // Both participants accept
    const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@nexus.test').invitation_token;
    const p2Token = gb.participants.find((p: any) => p.invited_email === 'p2@nexus.test').invitation_token;

    await app.call('POST', '/v1/group-bookings/invitations/accept', {
      headers: { cookie: participant1.cookie },
      body: { token: p1Token },
    });
    await app.call('POST', '/v1/group-bookings/invitations/accept', {
      headers: { cookie: participant2.cookie },
      body: { token: p2Token },
    });

    return { quoteId, gb };
  }

  // ===========================================================================
  // 1. Difference Breakdown & Summary
  // ===========================================================================
  describe('Difference Breakdown & Summary', () => {
    it('returns accurate difference breakdown before any payments are made', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      const res = await app.call('GET', `/v1/group-bookings/${gb.id}/difference-summary`, {
        headers: { cookie: organizer.cookie },
      });

      expect(res.status).toBe(200);
      const summary = (res.json as any).difference_summary;
      expect(summary.total_minor).toBe(gb.total_minor);
      expect(summary.due_now_minor).toBe(gb.due_now_minor);
      expect(summary.total_paid_minor).toBe(0);
      expect(summary.outstanding_difference_minor).toBe(gb.due_now_minor);
      expect(summary.is_fully_paid).toBe(false);
      expect(summary.unpaid_participants.length).toBe(3);
      expect(summary.paid_participants.length).toBe(0);
      expect(summary.seconds_remaining).toBeGreaterThan(0);
    });

    it('prohibits stranger from accessing difference summary (403 FORBIDDEN_GROUP_ACCESS)', async () => {
      const { gb } = await setupGroupBooking();

      const res = await app.call('GET', `/v1/group-bookings/${gb.id}/difference-summary`, {
        headers: { cookie: stranger.cookie },
      });

      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // 2. Organizer Pay-Difference Preconditions & Role Guards
  // ===========================================================================
  describe('Pay-Difference Preconditions & Role Guards', () => {
    it('prohibits non-organizer participant from executing pay-difference (403 NOT_GROUP_ORGANIZER)', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: participant1.cookie },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('NOT_GROUP_ORGANIZER');
    });

    it('rejects pay-difference if checkout was not yet initiated (409 INVALID_GROUP_STATUS)', async () => {
      const { gb } = await setupGroupBooking();

      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie },
      });

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('INVALID_GROUP_STATUS');
    });

    it('rejects pay-difference if group booking has expired (409 GROUP_BOOKING_EXPIRED)', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Expire booking
      await app.db.query(
        "UPDATE group_bookings SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [gb.id],
      );

      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie },
      });

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('GROUP_BOOKING_EXPIRED');
    });
  });

  // ===========================================================================
  // 3. Organizer Covers Full Due-Now Difference
  // ===========================================================================
  describe('Organizer Covers Full Due-Now Difference', () => {
    it('creates intent for 100% due-now difference and confirms booking upon capture', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Organizer calls pay-difference
      const diffRes = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie, 'x-request-id': 'req-pay-diff-full-1' },
      });

      expect(diffRes.status).toBe(201);
      const pi = (diffRes.json as any).payment_intent;
      expect(pi.amount_minor).toBe(gb.due_now_minor);
      expect(pi.provider_ref).toMatch(/^sbx_pi_/);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_PAY_DIFFERENCE_INITIATED'",
        [gb.id],
      );
      expect(auditRes.rowCount).toBe(1);

      // Capture difference payment
      const captureRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: organizer.cookie },
        body: { provider_ref: pi.provider_ref },
      });

      expect(captureRes.status).toBe(200);
      const result = (captureRes.json as any).result;
      expect(result.confirmed).toBe(true);
      expect(result.all_due_paid).toBe(true);
      expect(result.booking_id).toBeDefined();

      // Verify group status is now CONFIRMED
      const gbCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM group_bookings WHERE id = $1',
        [gb.id],
      );
      expect(gbCheck.rows[0].status).toBe('CONFIRMED');

      // Subsequent call to pay-difference rejects with 409 GROUP_ALREADY_CONFIRMED
      const dupRes = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie },
      });
      expect(dupRes.status).toBe(409);
      expect(app.errorOf(dupRes).code).toBe('GROUP_ALREADY_CONFIRMED');
    });
  });

  // ===========================================================================
  // 4. Organizer Covers Partial Difference for Delinquent/Declined Participant
  // ===========================================================================
  describe('Organizer Covers Partial Difference for Delinquent Participant', () => {
    it('allows organizer to cover only unpaid share and atomically confirms booking', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Organizer pays their share (4000 bani)
      const piOrg = await app.call('POST', `/v1/group-bookings/${gb.id}/payment-intent`, {
        headers: { cookie: organizer.cookie },
      });
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: organizer.cookie },
        body: { provider_ref: (piOrg.json as any).payment_intent.provider_ref },
      });

      // Participant 1 pays their share (4000 bani)
      const pi1 = await app.call('POST', `/v1/group-bookings/${gb.id}/payment-intent`, {
        headers: { cookie: participant1.cookie },
      });
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: participant1.cookie },
        body: { provider_ref: (pi1.json as any).payment_intent.provider_ref },
      });

      // Participant 2 does NOT pay. Check difference summary.
      const summaryRes = await app.call('GET', `/v1/group-bookings/${gb.id}/difference-summary`, {
        headers: { cookie: organizer.cookie },
      });
      const summary = (summaryRes.json as any).difference_summary;
      expect(summary.total_paid_minor).toBe(8000);
      expect(summary.outstanding_difference_minor).toBe(4000); // exactly participant 2's share
      expect(summary.unpaid_participants.length).toBe(1);
      expect(summary.paid_participants.length).toBe(2);

      // Organizer pays remaining difference (4000 bani)
      const diffRes = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie },
      });
      expect(diffRes.status).toBe(201);
      const diffPi = (diffRes.json as any).payment_intent;
      expect(diffPi.amount_minor).toBe(4000);

      // Capture difference payment
      const capRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: organizer.cookie },
        body: { provider_ref: diffPi.provider_ref },
      });

      expect(capRes.status).toBe(200);
      const result = (capRes.json as any).result;
      expect(result.confirmed).toBe(true);
      expect(result.all_due_paid).toBe(true);

      // Verify confirmed booking in bookings table
      const bCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM bookings WHERE id = $1',
        [result.booking_id],
      );
      expect(bCheck.rows[0].status).toBe('CONFIRMED');
    });
  });

  // ===========================================================================
  // 5. Late Participant Protection (Zero Double-Charge Guard)
  // ===========================================================================
  describe('Late Participant Protection (Zero Double-Charge Guard)', () => {
    it('refunds late participant capture if organizer already covered their share', async () => {
      const { gb } = await setupGroupBooking();

      await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Participant 2 creates payment intent before organizer covers it
      const pi2Res = await app.call('POST', `/v1/group-bookings/${gb.id}/payment-intent`, {
        headers: { cookie: participant2.cookie },
      });
      const pi2Ref = (pi2Res.json as any).payment_intent.provider_ref;

      // Meanwhile, organizer pays full difference and confirms the group booking!
      const diffRes = await app.call('POST', `/v1/group-bookings/${gb.id}/pay-difference`, {
        headers: { cookie: organizer.cookie },
      });
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: organizer.cookie },
        body: { provider_ref: (diffRes.json as any).payment_intent.provider_ref },
      });

      // Verify booking is confirmed
      const gbCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM group_bookings WHERE id = $1',
        [gb.id],
      );
      expect(gbCheck.rows[0].status).toBe('CONFIRMED');

      // Now Participant 2's payment capture arrives late!
      const lateCaptureRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        headers: { cookie: participant2.cookie },
        body: { provider_ref: pi2Ref },
      });

      expect(lateCaptureRes.status).toBe(200);
      const result = (lateCaptureRes.json as any).result;
      expect(result.confirmed).toBe(true);
      expect(result.refunded).toBe(true);
      expect(result.reason).toBe('SHARE_ALREADY_COVERED_BY_ORGANIZER');

      // Verify refund row created in refunds table
      const refundCheck = await app.db.query<{ reason: string; status: string; customer_id: string }>(
        'SELECT * FROM refunds WHERE group_booking_id = $1 AND reason = $2',
        [gb.id, 'SHARE_ALREADY_COVERED_BY_ORGANIZER'],
      );
      expect(refundCheck.rowCount).toBe(1);
      expect(refundCheck.rows[0].status).toBe('SUCCEEDED');
      expect(refundCheck.rows[0].customer_id).toBe(participant2.userId);

      // Verify audit event
      const auditCheck = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_PAYMENT_REFUNDED_ALREADY_COVERED'",
        [gb.id],
      );
      expect(auditCheck.rowCount).toBe(1);
    });
  });
});
