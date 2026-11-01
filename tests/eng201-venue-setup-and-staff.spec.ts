import { startTestApp, type TestApp } from './support/auth-harness';

interface Fixture {
  userId: string;
  cookie: string;
  tenantId: string;
  venueId: string;
}

async function createDraftVenueWithStaff(
  app: TestApp,
  tenantName: string,
  venueName: string,
  role: string = 'OWNER',
): Promise<Fixture> {
  const user = await app.verifiedUser();
  const tenant = await app.db.query<{ id: string }>(
    'INSERT INTO tenants (legal_name) VALUES ($1) RETURNING id',
    [tenantName],
  );
  const tenantId = tenant.rows[0].id;
  const venue = await app.db.query<{ id: string }>(
    "INSERT INTO venues (tenant_id, name, timezone, address, contact, publication_state) VALUES ($1, $2, 'Europe/Bucharest', '{\"city\":\"Bucharest\"}'::jsonb, '{\"phone\":\"+40700000000\"}'::jsonb, 'DRAFT') RETURNING id",
    [tenantId, venueName],
  );
  const venueId = venue.rows[0].id;
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
    [user.userId, venueId, tenantId, role],
  );

  if (['OWNER', 'VENUE_MANAGER', 'PLATFORM_ADMIN'].includes(role)) {
    await app.db.query(
      'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
        " VALUES ($1, 'totp', pgp_sym_encrypt('JBSWY3DPEHPK3PXP', 'test-mfa-key-0123456789abcdef0123456789'), now())" +
        ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
      [user.userId],
    );
  }

  return { ...user, tenantId, venueId };
}

describe('ENG-201 Venue Setup Wizard, Staff Invitation & Permissions', () => {
  let app: TestApp;
  let ownerFixture: Fixture;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng201');
      ownerFixture = await createDraftVenueWithStaff(
        app,
        'Esports Arena SRL',
        'Cyber Lounge Bucharest',
        'OWNER',
      );
    } catch (err) {
      console.error('beforeAll failed:', err);
      throw err;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('Venue Setup Wizard & Publication Gates', () => {
    it('tracks incomplete steps on a fresh DRAFT venue', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/wizard-progress`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(200);
      const progress = res.json as {
        is_complete: boolean;
        publication_state: string;
        step_details: { completed: boolean };
        step_rooms_zones: { completed: boolean; room_count: number; zone_count: number };
        step_resources: { completed: boolean; bookable_count: number };
        step_schedules: { completed: boolean };
        step_pricing_policies: { completed: boolean };
        step_staff: { completed: boolean; staff_count: number };
      };

      expect(progress.publication_state).toBe('DRAFT');
      expect(progress.is_complete).toBe(false);
      expect(progress.step_details.completed).toBe(true);
      expect(progress.step_rooms_zones.completed).toBe(false);
      expect(progress.step_rooms_zones.room_count).toBe(0);
      expect(progress.step_resources.completed).toBe(false);
      expect(progress.step_schedules.completed).toBe(false);
      expect(progress.step_pricing_policies.completed).toBe(false);
      expect(progress.step_staff.completed).toBe(true); // Owner membership already exists
    });

    it('returns missing requirements from publish-gates on incomplete venue', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/publish-gates`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(200);
      const gates = res.json as {
        can_publish: boolean;
        current_state: string;
        missing_requirements: string[];
      };

      expect(gates.can_publish).toBe(false);
      expect(gates.current_state).toBe('DRAFT');
      expect(gates.missing_requirements.length).toBeGreaterThan(0);
      expect(
        gates.missing_requirements.some((r) => r.includes('bookable resource')),
      ).toBe(true);
      expect(
        gates.missing_requirements.some((r) => r.includes('operating schedule')),
      ).toBe(true);
      expect(
        gates.missing_requirements.some((r) => r.includes('policy profile')),
      ).toBe(true);
      expect(
        gates.missing_requirements.some((r) => r.includes('price rule')),
      ).toBe(true);
    });

    it('rejects publishing when gates are not satisfied (400 PUBLISH_GATE_FAILED)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/publish`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('PUBLISH_GATE_FAILED');
    });

    it('successfully publishes venue once all gates are fulfilled', async () => {
      // 1. Add room and zone
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [ownerFixture.venueId, 'Main Hall'],
      );
      const roomId = roomRes.rows[0].id;

      // 2. Add policy profile
      const policyRes = await app.db.query<{ id: string }>(
        `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
         VALUES ($1, 'Standard Cyber Policy', true, $2)
         RETURNING id`,
        [
          ownerFixture.venueId,
          JSON.stringify({
            prepaid_mode: 'FULL',
            deposit_percentage: 100,
            slot_granularity_minutes: 15,
            min_duration_minutes: 60,
            max_duration_minutes: 240,
            free_cancellation_hours: 2,
            late_cancellation_penalty_percent: 50,
            reschedule_cutoff_hours: 2,
            no_show_grace_minutes: 15,
            no_show_fee_percent: 100,
            deposit_mode_settlement: 'ONLINE_ONLY',
          }),
        ],
      );
      const policyId = policyRes.rows[0].id;

      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [ownerFixture.venueId, roomId, 'PC Zone 1', policyId],
      );
      const zoneId = zoneRes.rows[0].id;

      // 3. Add bookable resource
      await app.db.query(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'RIG-01', 'AVAILABLE', true)",
        [ownerFixture.venueId, roomId, zoneId],
      );

      // 4. Add operating schedule
      await app.db.query(
        `INSERT INTO operating_schedules (venue_id, day_of_week, open_time, close_time, is_closed)
         VALUES ($1, 1, '10:00:00', '22:00:00', false)`,
        [ownerFixture.venueId],
      );

      // 5. Add price rule
      await app.db.query(
        "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 2500, 'RON')",
        [ownerFixture.venueId],
      );

      // Check publish gates now
      const gatesRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/publish-gates`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );
      expect(gatesRes.status).toBe(200);
      expect((gatesRes.json as any).can_publish).toBe(true);
      expect((gatesRes.json as any).missing_requirements).toHaveLength(0);

      // Publish venue
      const publishRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/publish`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(publishRes.status).toBe(200);
      const venue = (publishRes.json as any).venue;
      expect(venue.publication_state).toBe('PUBLISHED');

      // Verify audit and outbox
      const audit = await app.db.query(
        "SELECT * FROM audit_events WHERE venue_id = $1 AND action = 'VENUE_PUBLISHED'",
        [ownerFixture.venueId],
      );
      expect(audit.rows).toHaveLength(1);

      const outbox = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'VenuePublished'",
        [ownerFixture.venueId],
      );
      expect(outbox.rows).toHaveLength(1);
    });

    it('allows unpublishing a venue back to DRAFT', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/unpublish`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(res.status).toBe(200);
      const venue = (res.json as any).venue;
      expect(venue.publication_state).toBe('DRAFT');

      const audit = await app.db.query(
        "SELECT * FROM audit_events WHERE venue_id = $1 AND action = 'VENUE_UNPUBLISHED'",
        [ownerFixture.venueId],
      );
      expect(audit.rows).toHaveLength(1);
    });
  });

  describe('Staff Invitations & Permissions', () => {
    let invitationToken: string;
    let invitationId: string;
    const inviteeEmail = 'receptionist.dan@example.com';

    it('allows owner to issue staff invitation with secure 72h token', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            email: inviteeEmail,
            role: 'RECEPTION',
          },
        },
      );

      expect(res.status).toBe(201);
      const inv = (res.json as any).invitation;
      expect(inv.email).toBe(inviteeEmail);
      expect(inv.role).toBe('RECEPTION');
      expect(typeof inv.token).toBe('string');
      expect(inv.token.length).toBe(64); // 32 bytes hex

      invitationToken = inv.token;
      invitationId = inv.id;

      // Verify DB storage: token_hash is stored, status is PENDING
      const dbRow = await app.db.query<{ status: string; role: string; token_hash: Buffer }>(
        'SELECT status, role, token_hash FROM staff_invitations WHERE id = $1',
        [invitationId],
      );
      expect(dbRow.rows[0].status).toBe('PENDING');
      expect(dbRow.rows[0].role).toBe('RECEPTION');
      expect(dbRow.rows[0].token_hash).toBeDefined();

      // List invitations
      const listRes = await app.call(
        'GET',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );
      expect(listRes.status).toBe(200);
      const items = (listRes.json as any).invitations;
      expect(items.some((i: any) => i.id === invitationId)).toBe(true);
    });

    it('rejects duplicate pending invitation for the same email (400 INVITATION_ALREADY_PENDING)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            email: inviteeEmail,
            role: 'BAR_STAFF',
          },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('INVITATION_ALREADY_PENDING');
    });

    it('prevents venue manager from inviting owners or managers (403 ROLE_ELEVATION_NOT_PERMITTED)', async () => {
      // Create a venue manager user
      const managerUser = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [managerUser.userId, ownerFixture.venueId, ownerFixture.tenantId, 'VENUE_MANAGER'],
      );
      await app.db.query(
        'INSERT INTO user_mfa_factors (user_id, type, secret_encrypted, confirmed_at)' +
          " VALUES ($1, 'totp', pgp_sym_encrypt('JBSWY3DPEHPK3PXP', 'test-mfa-key-0123456789abcdef0123456789'), now())" +
          ' ON CONFLICT (user_id, type) DO UPDATE SET confirmed_at = now()',
        [managerUser.userId],
      );

      // Manager tries to invite another OWNER
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: managerUser.cookie },
          body: {
            email: 'new.owner@example.com',
            role: 'OWNER',
          },
        },
      );

      expect(res.status).toBe(403);
      const err = app.errorOf(res);
      expect(err.code).toBe('ROLE_ELEVATION_NOT_PERMITTED');
    });

    it('allows invitee to accept invitation and activates venue membership', async () => {
      const invitee = await app.verifiedUser();
      await app.db.query('UPDATE users SET email = $1 WHERE id = $2', [inviteeEmail, invitee.userId]);

      const acceptRes = await app.call('POST', '/v1/auth/invitations/accept', {
        headers: { cookie: invitee.cookie },
        body: { token: invitationToken },
      });

      expect(acceptRes.status).toBe(200);
      const data = acceptRes.json as { accepted: boolean; venue_id: string; role: string };
      expect(data.accepted).toBe(true);
      expect(data.venue_id).toBe(ownerFixture.venueId);
      expect(data.role).toBe('RECEPTION');

      // Verify membership active in DB
      const memRes = await app.db.query<{ role: string; active: boolean }>(
        'SELECT role, active FROM venue_memberships WHERE user_id = $1 AND venue_id = $2',
        [invitee.userId, ownerFixture.venueId],
      );
      expect(memRes.rows[0].role).toBe('RECEPTION');
      expect(memRes.rows[0].active).toBe(true);

      // Verify invitation status is ACCEPTED
      const invCheck = await app.db.query<{ status: string; accepted_at: Date }>(
        'SELECT status, accepted_at FROM staff_invitations WHERE id = $1',
        [invitationId],
      );
      expect(invCheck.rows[0].status).toBe('ACCEPTED');
      expect(invCheck.rows[0].accepted_at).not.toBeNull();
    });

    it('rejects token replay once invitation is accepted (400 INVITATION_ALREADY_USED)', async () => {
      const randomUser = await app.verifiedUser();

      const res = await app.call('POST', '/v1/auth/invitations/accept', {
        headers: { cookie: randomUser.cookie },
        body: { token: invitationToken },
      });

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('INVITATION_ALREADY_USED');
    });

    it('rejects acceptance of revoked invitation (400 INVITATION_REVOKED)', async () => {
      // Create and revoke invitation
      const createRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { email: 'revoked.staff@example.com', role: 'BAR_STAFF' },
        },
      );
      expect(createRes.status).toBe(201);
      const token = (createRes.json as any).invitation.token;
      const id = (createRes.json as any).invitation.id;

      // Revoke
      const revokeRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations/${id}/revoke`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );
      expect(revokeRes.status).toBe(200);

      // Attempt accept
      const someUser = await app.verifiedUser();
      const acceptRes = await app.call('POST', '/v1/auth/invitations/accept', {
        headers: { cookie: someUser.cookie },
        body: { token },
      });

      expect(acceptRes.status).toBe(400);
      const err = app.errorOf(acceptRes);
      expect(err.code).toBe('INVITATION_REVOKED');
    });

    it('rejects acceptance of expired invitation (400 INVITATION_EXPIRED)', async () => {
      const createRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/staff/invitations`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: { email: 'expired.staff@example.com', role: 'RECEPTION' },
        },
      );
      const token = (createRes.json as any).invitation.token;
      const id = (createRes.json as any).invitation.id;

      // Force expires_at into the past in DB
      await app.db.query(
        "UPDATE staff_invitations SET expires_at = now() - interval '1 hour' WHERE id = $1",
        [id],
      );

      const someUser = await app.verifiedUser();
      const acceptRes = await app.call('POST', '/v1/auth/invitations/accept', {
        headers: { cookie: someUser.cookie },
        body: { token },
      });

      expect(acceptRes.status).toBe(400);
      const err = app.errorOf(acceptRes);
      expect(err.code).toBe('INVITATION_EXPIRED');
    });

    it('prevents removing the last active OWNER of the venue (400 CANNOT_REMOVE_LAST_OWNER)', async () => {
      // Find owner's membership id
      const memRes = await app.db.query<{ id: string }>(
        "SELECT id FROM venue_memberships WHERE venue_id = $1 AND role = 'OWNER' AND active = true",
        [ownerFixture.venueId],
      );
      const ownerMemId = memRes.rows[0].id;

      const deleteRes = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${ownerFixture.venueId}/memberships/${ownerMemId}`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );

      expect(deleteRes.status).toBe(400);
      const err = app.errorOf(deleteRes);
      expect(err.code).toBe('CANNOT_REMOVE_LAST_OWNER');

      // Now add a second owner
      const secondOwner = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [secondOwner.userId, ownerFixture.venueId, ownerFixture.tenantId, 'OWNER'],
      );

      // Now removing the first owner succeeds because second active owner exists
      const deleteRes2 = await app.call(
        'DELETE',
        `/v1/dashboard/venues/${ownerFixture.venueId}/memberships/${ownerMemId}`,
        {
          headers: { cookie: ownerFixture.cookie },
        },
      );
      expect(deleteRes2.status).toBe(200);
      expect((deleteRes2.json as any).removed).toBe(true);

      const checkMem = await app.db.query<{ active: boolean }>(
        'SELECT active FROM venue_memberships WHERE id = $1',
        [ownerMemId],
      );
      expect(checkMem.rows[0].active).toBe(false);
    });
  });
});
