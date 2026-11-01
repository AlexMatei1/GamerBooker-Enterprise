import { startTestApp, type TestApp } from './support/auth-harness';
import { calculateEqualShares } from '../src/bookings/group.service';

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

describe('ENG-302 Group Booking Payments, Completion Checks & Timeout Compensation', () => {
  let app: TestApp;
  let fixtures: { venueId: string; tenantId: string };
  let organizer: { cookie: string; userId: string };
  let participant1: { cookie: string; userId: string };
  let participant2: { cookie: string; userId: string };
  let participant3: { cookie: string; userId: string };
  let stranger: { cookie: string; userId: string };

  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;

  beforeAll(async () => {
    app = await startTestApp('eng302');
    fixtures = await createVenueWithRoles(app, 'Pulse Gaming SRL', 'Pulse Arena Cluj');

    organizer = await app.verifiedUser();
    participant1 = await app.verifiedUser();
    participant2 = await app.verifiedUser();
    participant3 = await app.verifiedUser();
    stranger = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Pulse Main Arena'],
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
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'ARENA-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc1Id = p1.rows[0].id;

    const p2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'ARENA-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc2Id = p2.rows[0].id;

    const p3 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'ARENA-03', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc3Id = p3.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  let bookingOffsetHours = 24;
  // Helper to create a fresh group booking
  async function setupGroupBooking(mode: 'SPLIT_BY_PARTICIPANT' | 'ORGANIZER_PAYS_ALL' = 'SPLIT_BY_PARTICIPANT') {
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
        mode,
        participants: [
          { email: 'p1@pulse.test' },
          { email: 'p2@pulse.test' },
        ],
      },
    });
    expect(gbRes.status).toBe(201);
    const gb = (gbRes.json as any).group_booking;
    return { quoteId, gb };
  }

  // ===========================================================================
  // 1. Group Checkout Initiation & Atomic Hold
  // ===========================================================================
  describe('Group Checkout Initiation & Atomic Hold', () => {
    it('rejects initiating checkout before all invited participants accept (400 PENDING_INVITATIONS_EXIST)', async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');

      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('PENDING_INVITATIONS_EXIST');
    });

    it('rejects non-organizer attempting to initiate checkout (403 NOT_GROUP_ORGANIZER)', async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');

      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });

      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: participant1.cookie },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('NOT_GROUP_ORGANIZER');
    });

    it('successfully initiates checkout and acquires atomic hold once participants accept', async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');

      // Accept tokens for p1 and p2
      const p1Token = gb.participants.find((p: any) => !p.is_organizer && p.invited_email === 'p1@pulse.test').invitation_token;
      const p2Token = gb.participants.find((p: any) => !p.is_organizer && p.invited_email === 'p2@pulse.test').invitation_token;

      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant2.cookie },
        body: { token: p2Token },
      });

      // Initiate checkout
      const res = await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie, 'x-request-id': 'req-init-checkout-1' },
      });

      expect(res.status).toBe(200);
      const checkout = (res.json as any).checkout;
      expect(checkout.hold_id).toBeDefined();
      expect(checkout.group_booking.status).toBe('PENDING_PAYMENTS');

      // Verify hold in DB
      const holdCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM holds WHERE id = $1',
        [checkout.hold_id],
      );
      expect(holdCheck.rows[0].status).toBe('ACTIVE');

      // Verify audit event
      const auditCheck = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_CHECKOUT_INITIATED'",
        [gb.id],
      );
      expect(auditCheck.rowCount).toBe(1);
    });
  });

  // ===========================================================================
  // 2. Per-Payer Payment Intent Creation
  // ===========================================================================
  describe('Per-Payer Payment Intent Creation', () => {
    let groupBookingId: string;
    let p1PartId: string;
    let p2PartId: string;
    let orgPartId: string;

    beforeAll(async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');
      groupBookingId = gb.id;

      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      const p2Token = gb.participants.find((p: any) => p.invited_email === 'p2@pulse.test').invitation_token;

      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant2.cookie },
        body: { token: p2Token },
      });

      await app.call('POST', `/v1/group-bookings/${groupBookingId}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      const updated = await app.call('GET', `/v1/group-bookings/${groupBookingId}`, {
        headers: { cookie: organizer.cookie },
      });
      const parts = (updated.json as any).group_booking.participants;
      orgPartId = parts.find((p: any) => p.is_organizer).id;
      p1PartId = parts.find((p: any) => p.user_id === participant1.userId).id;
      p2PartId = parts.find((p: any) => p.user_id === participant2.userId).id;
    });

    it('allows participant 1 to create payment intent for their exact share due-now', async () => {
      const res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant1.cookie },
        body: { participant_id: p1PartId },
      });

      expect(res.status).toBe(201);
      const pi = (res.json as any).payment_intent;
      expect(pi.intent_id).toBeDefined();
      expect(pi.provider_ref).toMatch(/^sbx_pi_/);
      expect(pi.amount_minor).toBeGreaterThan(0);
      expect(pi.currency).toBe('RON');
      expect(pi.participant_id).toBe(p1PartId);

      // Verify participant status transitioned to PAYING
      const partCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM group_participants WHERE id = $1',
        [p1PartId],
      );
      expect(partCheck.rows[0].status).toBe('PAYING');
    });

    it('prohibits non-organizer participant from creating intent for someone else (403 FORBIDDEN_PAYMENT)', async () => {
      const res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant1.cookie },
        body: { participant_id: p2PartId },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('FORBIDDEN_PAYMENT');
    });

    it('prohibits unrelated user from creating payment intent (403 FORBIDDEN_GROUP_ACCESS)', async () => {
      const res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: stranger.cookie },
        body: { participant_id: p1PartId },
      });

      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // 3. Multi-Payer Completion Checks & Atomic Confirmation
  // ===========================================================================
  describe('Multi-Payer Completion Checks & Atomic Confirmation', () => {
    let groupBookingId: string;
    let piOrgRef: string;
    let pi1Ref: string;
    let pi2Ref: string;

    beforeAll(async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');
      groupBookingId = gb.id;

      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      const p2Token = gb.participants.find((p: any) => p.invited_email === 'p2@pulse.test').invitation_token;

      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant2.cookie },
        body: { token: p2Token },
      });

      await app.call('POST', `/v1/group-bookings/${groupBookingId}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Create payment intents for all 3 participants
      const piOrgRes = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: organizer.cookie },
      });
      piOrgRef = (piOrgRes.json as any).payment_intent.provider_ref;

      const pi1Res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant1.cookie },
      });
      pi1Ref = (pi1Res.json as any).payment_intent.provider_ref;

      const pi2Res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant2.cookie },
      });
      pi2Ref = (pi2Res.json as any).payment_intent.provider_ref;
    });

    it('keeps group in PENDING_PAYMENTS when only first participant pays', async () => {
      const captureRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: piOrgRef },
      });

      expect(captureRes.status).toBe(200);
      const res = (captureRes.json as any).result;
      expect(res.confirmed).toBe(false);
      expect(res.all_due_paid).toBe(false);

      const gbCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM group_bookings WHERE id = $1',
        [groupBookingId],
      );
      expect(gbCheck.rows[0].status).toBe('PENDING_PAYMENTS');
    });

    it('handles duplicate webhook capture idempotently without duplicate share counting', async () => {
      const firstCheck = await app.db.query<{ share_paid_minor: string }>(
        'SELECT share_paid_minor FROM group_participants WHERE group_booking_id = $1 AND is_organizer = true',
        [groupBookingId],
      );
      const paidBefore = Number(firstCheck.rows[0].share_paid_minor);

      // Re-send capture for organizer
      const captureRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: piOrgRef },
      });

      expect(captureRes.status).toBe(200);
      const paidAfterCheck = await app.db.query<{ share_paid_minor: string }>(
        'SELECT share_paid_minor FROM group_participants WHERE group_booking_id = $1 AND is_organizer = true',
        [groupBookingId],
      );
      // Ensure share_paid_minor did not increment twice
      expect(Number(paidAfterCheck.rows[0].share_paid_minor)).toBe(paidBefore);
    });

    it('atomically confirms booking when all participants finish paying', async () => {
      // Participant 1 pays
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: pi1Ref },
      });

      // Participant 2 pays (final share)
      const finalCapture = await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: pi2Ref },
      });

      expect(finalCapture.status).toBe(200);
      const result = (finalCapture.json as any).result;
      expect(result.confirmed).toBe(true);
      expect(result.all_due_paid).toBe(true);
      expect(result.booking_id).toBeDefined();
      expect(result.public_code).toMatch(/^GB-[A-Z0-9]+$/);

      // Verify DB status
      const gbCheck = await app.db.query<{ status: string; booking_id: string }>(
        'SELECT status, booking_id FROM group_bookings WHERE id = $1',
        [groupBookingId],
      );
      expect(gbCheck.rows[0].status).toBe('CONFIRMED');
      expect(gbCheck.rows[0].booking_id).toBe(result.booking_id);

      // Verify confirmed booking in bookings table
      const bCheck = await app.db.query<{ status: string; public_code: string }>(
        'SELECT status, public_code FROM bookings WHERE id = $1',
        [result.booking_id],
      );
      expect(bCheck.rows[0].status).toBe('CONFIRMED');

      // Verify audit event
      const auditCheck = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_BOOKING_CONFIRMED'",
        [groupBookingId],
      );
      expect(auditCheck.rowCount).toBe(1);
    });
  });

  // ===========================================================================
  // 4. Timeout Compensation (Partial Payments Expired -> 0 Booking + N Refunds)
  // ===========================================================================
  describe('Timeout Compensation (Partial Payments Expired)', () => {
    let groupBookingId: string;
    let piOrgRef: string;
    let pi1Ref: string;

    beforeAll(async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');
      groupBookingId = gb.id;

      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      const p2Token = gb.participants.find((p: any) => p.invited_email === 'p2@pulse.test').invitation_token;

      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant2.cookie },
        body: { token: p2Token },
      });

      await app.call('POST', `/v1/group-bookings/${groupBookingId}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Organizer and Participant 1 pay, Participant 2 DOES NOT PAY
      const piOrgRes = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: organizer.cookie },
      });
      piOrgRef = (piOrgRes.json as any).payment_intent.provider_ref;

      const pi1Res = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant1.cookie },
      });
      pi1Ref = (pi1Res.json as any).payment_intent.provider_ref;

      // Capture payments for organizer and participant 1
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: piOrgRef },
      });
      await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: pi1Ref },
      });
    });

    it('expires group booking, releases hold, and initiates compensating refunds for paid participants', async () => {
      const expireRes = await app.call('POST', `/v1/group-bookings/${groupBookingId}/expire`);
      expect(expireRes.status).toBe(200);

      const result = (expireRes.json as any).result;
      expect(result.expired).toBe(true);
      expect(result.refunded_count).toBe(2); // Exactly 2 paid participants refunded
      expect(result.refunded_total_minor).toBeGreaterThan(0);

      // Verify group booking status
      const gbCheck = await app.db.query<{ status: string; booking_id: string | null }>(
        'SELECT status, booking_id FROM group_bookings WHERE id = $1',
        [groupBookingId],
      );
      expect(gbCheck.rows[0].status).toBe('EXPIRED');
      expect(gbCheck.rows[0].booking_id).toBeNull();

      // Verify zero bookings created in bookings table
      const bCount = await app.db.query<{ count: string }>(
        'SELECT count(*) as count FROM bookings WHERE hold_id = (SELECT hold_id FROM group_bookings WHERE id = $1)',
        [groupBookingId],
      );
      expect(Number(bCount.rows[0].count)).toBe(0);

      // Verify refund rows created in refunds table
      const refundRows = await app.db.query<{ id: string; amount_minor: string; status: string; reason: string }>(
        'SELECT * FROM refunds WHERE group_booking_id = $1',
        [groupBookingId],
      );
      expect(refundRows.rowCount).toBe(2);
      for (const r of refundRows.rows) {
        expect(r.status).toBe('SUCCEEDED');
        expect(r.reason).toBe('GROUP_BOOKING_TIMEOUT_EXPIRED');
      }

      // Verify audit event
      const auditCheck = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_BOOKING_TIMEOUT_EXPIRED'",
        [groupBookingId],
      );
      expect(auditCheck.rowCount).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Late PSP Capture After TTL (Refund without Resurrection)
  // ===========================================================================
  describe('Late PSP Capture After TTL (Zero-Resurrection Guard)', () => {
    let groupBookingId: string;
    let latePiRef: string;

    beforeAll(async () => {
      const { gb } = await setupGroupBooking('SPLIT_BY_PARTICIPANT');
      groupBookingId = gb.id;

      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      const p2Token = gb.participants.find((p: any) => p.invited_email === 'p2@pulse.test').invitation_token;

      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant2.cookie },
        body: { token: p2Token },
      });

      await app.call('POST', `/v1/group-bookings/${groupBookingId}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });

      // Participant creates payment intent
      const piRes = await app.call('POST', `/v1/group-bookings/${groupBookingId}/payment-intent`, {
        headers: { cookie: participant1.cookie },
      });
      latePiRef = (piRes.json as any).payment_intent.provider_ref;

      // Group booking expires before capture happens
      await app.db.query(
        "UPDATE group_bookings SET status = 'EXPIRED', expires_at = now() - interval '1 hour' WHERE id = $1",
        [groupBookingId],
      );
    });

    it('rejects resurrecting expired group booking and immediately refunds late capture', async () => {
      const res = await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: latePiRef },
      });

      expect(res.status).toBe(200);
      const result = (res.json as any).result;
      expect(result.confirmed).toBe(false);
      expect(result.refunded).toBe(true);
      expect(result.reason).toBe('GROUP_BOOKING_EXPIRED');

      // Verify group booking did NOT resurrect
      const gbCheck = await app.db.query<{ status: string; booking_id: string | null }>(
        'SELECT status, booking_id FROM group_bookings WHERE id = $1',
        [groupBookingId],
      );
      expect(gbCheck.rows[0].status).toBe('EXPIRED');
      expect(gbCheck.rows[0].booking_id).toBeNull();

      // Verify refund record
      const refundCheck = await app.db.query<{ reason: string; status: string }>(
        'SELECT * FROM refunds WHERE group_booking_id = $1',
        [groupBookingId],
      );
      expect(refundCheck.rowCount).toBe(1);
      expect(refundCheck.rows[0].reason).toBe('PSP_CONFIRM_AFTER_TTL_REFUND');
      expect(refundCheck.rows[0].status).toBe('SUCCEEDED');
    });
  });

  // ===========================================================================
  // 6. ORGANIZER_PAYS_ALL Mode
  // ===========================================================================
  describe('ORGANIZER_PAYS_ALL Checkout & Capture', () => {
    it('allows organizer to pay 100% due-now in one transaction and immediately confirms', async () => {
      const { gb } = await setupGroupBooking('ORGANIZER_PAYS_ALL');

      // In ORGANIZER_PAYS_ALL, checkout can be initiated directly by organizer
      const initRes = await app.call('POST', `/v1/group-bookings/${gb.id}/checkout/initiate`, {
        headers: { cookie: organizer.cookie },
      });
      expect(initRes.status).toBe(200);

      // Create payment intent (100% of due_now_minor)
      const piRes = await app.call('POST', `/v1/group-bookings/${gb.id}/payment-intent`, {
        headers: { cookie: organizer.cookie },
      });
      expect(piRes.status).toBe(201);
      const pi = (piRes.json as any).payment_intent;
      expect(pi.amount_minor).toBe(gb.due_now_minor);

      // Participant 1 accepts invitation
      const p1Token = gb.participants.find((p: any) => p.invited_email === 'p1@pulse.test').invitation_token;
      await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: participant1.cookie },
        body: { token: p1Token },
      });

      // Guest cannot create payment intent in this mode (403 NOT_GROUP_ORGANIZER)
      const guestRes = await app.call('POST', `/v1/group-bookings/${gb.id}/payment-intent`, {
        headers: { cookie: participant1.cookie },
      });
      expect(guestRes.status).toBe(403);
      expect(app.errorOf(guestRes).code).toBe('NOT_GROUP_ORGANIZER');

      // Capture organizer's payment
      const captureRes = await app.call('POST', '/v1/group-bookings/payments/capture', {
        body: { provider_ref: pi.provider_ref },
      });
      expect(captureRes.status).toBe(200);
      const result = (captureRes.json as any).result;
      expect(result.confirmed).toBe(true);
      expect(result.all_due_paid).toBe(true);
      expect(result.public_code).toMatch(/^GB-[A-Z0-9]+$/);
    });
  });
});
