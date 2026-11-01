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
  const receptionUser = await app.verifiedUser();
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [receptionUser.userId, venueId, tenantId, 'RECEPTION'],
  );

  return {
    owner: { ...ownerUser, tenantId, venueId },
    manager: { ...managerUser, tenantId, venueId },
    reception: { ...receptionUser, tenantId, venueId },
    venueId,
    tenantId,
  };
}

describe('ENG-301 Group Booking Split Allocation & Invitation Tokens', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let organizer: { userId: string; cookie: string };
  let friendA: { userId: string; cookie: string };
  let friendB: { userId: string; cookie: string };
  let stranger: { userId: string; cookie: string };

  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;
  let validQuoteId: string;

  beforeAll(async () => {
    app = await startTestApp('eng301');
    fixtures = await createVenueWithRoles(app, 'TeamPulse Esports SRL', 'TeamPulse Cluj');

    organizer = await app.verifiedUser();
    friendA = await app.verifiedUser();
    friendB = await app.verifiedUser();
    stranger = await app.verifiedUser();

    // 1. Seed Rooms, Policies, Pricing, Resources
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Arena Room A'],
    );
    const roomId = r1.rows[0].id;

    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 50, "deposit_mode_settlement": "ONLINE_OR_RECEPTION", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')",
      [fixtures.venueId],
    );

    const p1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'PULSE-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc1Id = p1.rows[0].id;

    const p2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'PULSE-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc2Id = p2.rows[0].id;

    const p3 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'PULSE-03', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, roomId],
    );
    pc3Id = p3.rows[0].id;

    // 2. Create quote for 3 PCs for 2 hours (Total 3 * 2h * 3000 = 18000 bani; Due now 50% = 9000 bani)
    const quoteStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const quoteEnd = new Date(Date.now() + 26 * 3600 * 1000).toISOString();

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
    validQuoteId = (qRes.json as any).quote_id;
  });

  afterAll(async () => {
    await app.stop();
  });

  // ===========================================================================
  // 1. Exact Integer Share Arithmetic & Penny Remainder
  // ===========================================================================
  describe('Penny-Exact Split Arithmetic', () => {
    it('splits 10000 total and 4000 due now equally among 3 participants with deterministic penny remainder', () => {
      // 10000 / 3 = 3333 rem 1 -> [3334, 3333, 3333]
      // 4000 / 3 = 1333 rem 1 -> [1334, 1333, 1333]
      const shares = calculateEqualShares(10000, 4000, 3);
      expect(shares.length).toBe(3);

      expect(shares[0].share_total_minor).toBe(3334);
      expect(shares[0].share_due_now_minor).toBe(1334);
      expect(shares[0].share_balance_minor).toBe(2000);

      expect(shares[1].share_total_minor).toBe(3333);
      expect(shares[1].share_due_now_minor).toBe(1333);
      expect(shares[1].share_balance_minor).toBe(2000);

      expect(shares[2].share_total_minor).toBe(3333);
      expect(shares[2].share_due_now_minor).toBe(1333);
      expect(shares[2].share_balance_minor).toBe(2000);

      // Exact sum invariant checks
      const sumTotal = shares.reduce((acc, s) => acc + s.share_total_minor, 0);
      const sumDueNow = shares.reduce((acc, s) => acc + s.share_due_now_minor, 0);
      expect(sumTotal).toBe(10000);
      expect(sumDueNow).toBe(4000);
    });

    it('splits 7 bani remainder cleanly across 5 participants', () => {
      // 17 bani total / 5 = 3 rem 2 -> [4, 4, 3, 3, 3]
      const shares = calculateEqualShares(17, 7, 5);
      expect(shares.length).toBe(5);

      const sumTotal = shares.reduce((acc, s) => acc + s.share_total_minor, 0);
      const sumDueNow = shares.reduce((acc, s) => acc + s.share_due_now_minor, 0);
      expect(sumTotal).toBe(17);
      expect(sumDueNow).toBe(7);
      expect(shares[0].share_total_minor).toBe(4);
      expect(shares[1].share_total_minor).toBe(4);
      expect(shares[2].share_total_minor).toBe(3);
    });
  });

  // ===========================================================================
  // 2. Group Booking Creation
  // ===========================================================================
  describe('Group Booking Creation', () => {
    it('creates a SPLIT_BY_PARTICIPANT group booking with single-use tokens and equal splits', async () => {
      const res = await app.call('POST', '/v1/group-bookings', {
        headers: { cookie: organizer.cookie, 'x-request-id': 'req-create-group-1' },
        body: {
          quote_id: validQuoteId,
          mode: 'SPLIT_BY_PARTICIPANT',
          participants: [
            { email: 'friend.a@gamerbooker.test', assigned_resource_id: pc2Id },
            { email: 'friend.b@gamerbooker.test', assigned_resource_id: pc3Id },
          ],
        },
      });

      expect(res.status).toBe(201);
      const gb = (res.json as any).group_booking;
      expect(gb.id).toBeDefined();
      expect(gb.mode).toBe('SPLIT_BY_PARTICIPANT');
      expect(gb.status).toBe('DRAFT');
      expect(gb.total_minor).toBe(18000);
      expect(gb.due_now_minor).toBe(9000);

      // Total 3 participants: organizer + 2 invited
      expect(gb.participants.length).toBe(3);

      const org = gb.participants.find((p: any) => p.is_organizer);
      expect(org).toBeDefined();
      expect(org.user_id).toBe(organizer.userId);
      expect(org.status).toBe('ACCEPTED');
      expect(org.share_total_minor).toBe(6000);
      expect(org.share_due_now_minor).toBe(3000);

      const invited = gb.participants.filter((p: any) => !p.is_organizer);
      expect(invited.length).toBe(2);
      expect(invited[0].invitation_token).toBeDefined();
      expect(invited[0].invitation_token.length).toBeGreaterThanOrEqual(32);
      expect(invited[0].status).toBe('INVITED');
      expect(invited[0].share_total_minor).toBe(6000);
      expect(invited[0].share_due_now_minor).toBe(3000);

      // Verify DB audit event
      const auditRes = await app.db.query<{ action: string; target_id: string }>(
        "SELECT action, target_id FROM audit_events WHERE target_id = $1 AND action = 'GROUP_BOOKING_CREATED'",
        [gb.id],
      );
      expect(auditRes.rowCount).toBe(1);

      // Verify outbox event
      const outboxRes = await app.db.query<{ event_type: string }>(
        "SELECT event_type FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'GroupBookingCreated'",
        [gb.id],
      );
      expect(outboxRes.rowCount).toBe(1);
    });

    it('creates an ORGANIZER_PAYS_ALL group booking assigning 100% due-now to organizer', async () => {
      // Create second quote for organizer
      const qRes = await app.call('POST', '/v1/quotes', {
        headers: { cookie: organizer.cookie },
        body: {
          venue_id: fixtures.venueId,
          resource_ids: [pc1Id, pc2Id],
          starts_at: new Date(Date.now() + 30 * 3600 * 1000).toISOString(),
          ends_at: new Date(Date.now() + 32 * 3600 * 1000).toISOString(),
        },
      });
      const quote2Id = (qRes.json as any).quote_id;

      const res = await app.call('POST', '/v1/group-bookings', {
        headers: { cookie: organizer.cookie },
        body: {
          quote_id: quote2Id,
          mode: 'ORGANIZER_PAYS_ALL',
          participants: [{ email: 'guest@gamerbooker.test' }],
        },
      });

      expect(res.status).toBe(201);
      const gb = (res.json as any).group_booking;
      expect(gb.mode).toBe('ORGANIZER_PAYS_ALL');

      const org = gb.participants.find((p: any) => p.is_organizer);
      expect(org.share_total_minor).toBe(gb.total_minor);
      expect(org.share_due_now_minor).toBe(gb.due_now_minor);

      const guest = gb.participants.find((p: any) => !p.is_organizer);
      expect(guest.share_total_minor).toBe(0);
      expect(guest.share_due_now_minor).toBe(0);
    });

    it('rejects creating group booking with another customer quote (403 NOT_QUOTE_OWNER)', async () => {
      const res = await app.call('POST', '/v1/group-bookings', {
        headers: { cookie: stranger.cookie },
        body: {
          quote_id: validQuoteId, // owned by organizer
          mode: 'SPLIT_BY_PARTICIPANT',
        },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('NOT_QUOTE_OWNER');
    });
  });

  // ===========================================================================
  // 3. Custom Share Adjustment
  // ===========================================================================
  describe('Custom Share Adjustment', () => {
    let groupBookingId: string;
    let participantIds: string[];

    beforeAll(async () => {
      const gbRes = await app.db.query<{ id: string }>(
        'SELECT id FROM group_bookings WHERE quote_id = $1',
        [validQuoteId],
      );
      groupBookingId = gbRes.rows[0].id;

      const pRes = await app.db.query<{ id: string }>(
        'SELECT id FROM group_participants WHERE group_booking_id = $1 ORDER BY is_organizer DESC, created_at ASC',
        [groupBookingId],
      );
      participantIds = pRes.rows.map((r) => r.id);
    });

    it('allows organizer to adjust shares as long as the exact sum invariant holds', async () => {
      // Total = 18000, due_now = 9000
      // Custom allocation:
      // Organizer: total 10000, due_now 5000
      // Friend A: total 5000, due_now 2500
      // Friend B: total 3000, due_now 1500
      // Sum total = 18000, Sum due_now = 9000
      const res = await app.call('PATCH', `/v1/group-bookings/${groupBookingId}/shares`, {
        headers: { cookie: organizer.cookie, 'x-request-id': 'req-adj-shares-1' },
        body: {
          shares: [
            { participant_id: participantIds[0], share_total_minor: 10000, share_due_now_minor: 5000 },
            { participant_id: participantIds[1], share_total_minor: 5000, share_due_now_minor: 2500 },
            { participant_id: participantIds[2], share_total_minor: 3000, share_due_now_minor: 1500 },
          ],
        },
      });

      expect(res.status).toBe(200);
      const gb = (res.json as any).group_booking;
      const p0 = gb.participants.find((p: any) => p.id === participantIds[0]);
      expect(p0.share_total_minor).toBe(10000);
      expect(p0.share_due_now_minor).toBe(5000);
      expect(p0.share_balance_minor).toBe(5000);

      const p1 = gb.participants.find((p: any) => p.id === participantIds[1]);
      expect(p1.share_total_minor).toBe(5000);
      expect(p1.share_due_now_minor).toBe(2500);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_id = $1 AND action = 'GROUP_SHARES_ADJUSTED'",
        [groupBookingId],
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('rejects share adjustment if sum of shares does not match group total (400 INVALID_SHARE_SUM)', async () => {
      const res = await app.call('PATCH', `/v1/group-bookings/${groupBookingId}/shares`, {
        headers: { cookie: organizer.cookie },
        body: {
          shares: [
            { participant_id: participantIds[0], share_total_minor: 10000, share_due_now_minor: 5000 },
            { participant_id: participantIds[1], share_total_minor: 5000, share_due_now_minor: 2500 },
            { participant_id: participantIds[2], share_total_minor: 2000, share_due_now_minor: 1000 }, // sum total 17000 != 18000
          ],
        },
      });

      expect(res.status).toBe(400);
      expect(app.errorOf(res).code).toBe('INVALID_SHARE_SUM');
    });

    it('prevents non-organizer from adjusting shares (403 NOT_GROUP_ORGANIZER)', async () => {
      const res = await app.call('PATCH', `/v1/group-bookings/${groupBookingId}/shares`, {
        headers: { cookie: friendA.cookie },
        body: {
          shares: [
            { participant_id: participantIds[0], share_total_minor: 6000, share_due_now_minor: 3000 },
            { participant_id: participantIds[1], share_total_minor: 6000, share_due_now_minor: 3000 },
            { participant_id: participantIds[2], share_total_minor: 6000, share_due_now_minor: 3000 },
          ],
        },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('NOT_GROUP_ORGANIZER');
    });
  });

  // ===========================================================================
  // 4. Invitation Token Lifecycle (Accept & Decline)
  // ===========================================================================
  describe('Invitation Token Lifecycle', () => {
    let tokenFriendA: string;
    let tokenFriendB: string;

    beforeAll(async () => {
      // Get tokens for friend A and friend B
      const pRes = await app.db.query<{ invitation_token: string; invited_email: string }>(
        'SELECT invitation_token, invited_email FROM group_participants WHERE is_organizer = false ORDER BY created_at ASC',
      );
      tokenFriendA = pRes.rows[0].invitation_token;
      tokenFriendB = pRes.rows[1].invitation_token;
    });

    it('allows friend A to accept invitation token and binds their user ID', async () => {
      const res = await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: friendA.cookie, 'x-request-id': 'req-accept-token-a' },
        body: { token: tokenFriendA },
      });

      expect(res.status).toBe(200);
      expect((res.json as any).accepted).toBe(true);
      const participant = (res.json as any).participant;
      expect(participant.user_id).toBe(friendA.userId);
      expect(participant.status).toBe('ACCEPTED');
      expect(participant.accepted_at).toBeDefined();

      // Check DB audit event
      const auditRes = await app.db.query<{ action: string; actor_id: string }>(
        "SELECT action, actor_id FROM audit_events WHERE target_id = $1 AND action = 'GROUP_INVITATION_ACCEPTED'",
        [participant.id],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].actor_id).toBe(friendA.userId);
    });

    it('rejects duplicate redemption of the same token (409 INVITATION_ALREADY_ACCEPTED)', async () => {
      const res = await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: friendA.cookie },
        body: { token: tokenFriendA },
      });

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('INVITATION_ALREADY_ACCEPTED');
    });

    it('rejects accepting invitation when the user is already in the group (409 USER_ALREADY_IN_GROUP)', async () => {
      // friend A (already in group) tries to accept token B
      const res = await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: friendA.cookie },
        body: { token: tokenFriendB },
      });

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('USER_ALREADY_IN_GROUP');
    });

    it('allows friend B to decline invitation and marks status as DECLINED', async () => {
      const res = await app.call('POST', '/v1/group-bookings/invitations/decline', {
        headers: { cookie: friendB.cookie },
        body: { token: tokenFriendB },
      });

      expect(res.status).toBe(200);
      expect((res.json as any).declined).toBe(true);

      // Verify DB status
      const partCheck = await app.db.query<{ status: string }>(
        'SELECT status FROM group_participants WHERE invitation_token = $1',
        [tokenFriendB],
      );
      expect(partCheck.rows[0].status).toBe('DECLINED');
    });

    it('rejects accepting a declined invitation token (409 INVITATION_DECLINED)', async () => {
      const res = await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: friendB.cookie },
        body: { token: tokenFriendB },
      });

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('INVITATION_DECLINED');
    });

    it('rejects invalid or non-existent token with 404 INVITATION_NOT_FOUND', async () => {
      const res = await app.call('POST', '/v1/group-bookings/invitations/accept', {
        headers: { cookie: friendB.cookie },
        body: { token: 'invalid-non-existent-token-1234567890' },
      });

      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('INVITATION_NOT_FOUND');
    });
  });

  // ===========================================================================
  // 5. Zero-Social Masking & Privacy Boundary
  // ===========================================================================
  describe('Zero-Social Masking & Privacy Boundary', () => {
    let groupBookingId: string;

    beforeAll(async () => {
      const gbRes = await app.db.query<{ id: string }>(
        'SELECT id FROM group_bookings WHERE quote_id = $1',
        [validQuoteId],
      );
      groupBookingId = gbRes.rows[0].id;
    });

    it('allows participant to view group booking but masks invitation tokens of others', async () => {
      const res = await app.call('GET', `/v1/group-bookings/${groupBookingId}`, {
        headers: { cookie: friendA.cookie },
      });

      expect(res.status).toBe(200);
      const gb = (res.json as any).group_booking;
      expect(gb.participants.length).toBe(3);

      const me = gb.participants.find((p: any) => p.user_id === friendA.userId);
      expect(me).toBeDefined();

      const others = gb.participants.filter((p: any) => p.user_id !== friendA.userId);
      for (const other of others) {
        // Tokens of others must be hidden from non-organizer participant
        expect(other.invitation_token).toBeNull();
      }
    });

    it('prohibits unrelated user from accessing group booking details (403 FORBIDDEN_GROUP_ACCESS)', async () => {
      const res = await app.call('GET', `/v1/group-bookings/${groupBookingId}`, {
        headers: { cookie: stranger.cookie },
      });

      expect(res.status).toBe(403);
      expect(app.errorOf(res).code).toBe('FORBIDDEN_GROUP_ACCESS');
    });
  });
});
