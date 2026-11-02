/**
 * Acceptance test suite for ENG-207:
 * Pricing/policies UI with customer preview, estimate scenarios, and clear examples.
 */
import { startTestApp, type TestApp } from './support/auth-harness';

interface Fixture {
  userId: string;
  cookie: string;
  email: string;
  tenantId: string;
  venueId: string;
}

async function createTenantAndVenue(
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
    "INSERT INTO venues (tenant_id, name, timezone, publication_state) VALUES ($1, $2, 'Europe/Bucharest', 'PUBLISHED') RETURNING id",
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

describe('ENG-207 Pricing and Policy Customer Preview Engine', () => {
  let app: TestApp;
  let owner: Fixture;
  let reception: Fixture;
  let customer: Fixture;
  let standardPcId: string;
  let vipPcId: string;

  beforeAll(async () => {
    app = await startTestApp('eng207');
    owner = await createTenantAndVenue(app, 'Cyber Dome SRL', 'Cyber Dome Arena', 'OWNER');

    // Create Reception staff
    const recUser = await app.verifiedUser();
    await app.db.query(
      'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
      [recUser.userId, owner.venueId, owner.tenantId, 'RECEPTION'],
    );
    reception = { ...recUser, tenantId: owner.tenantId, venueId: owner.venueId };

    // Create Customer
    const custUser = await app.verifiedUser();
    customer = { ...custUser, tenantId: owner.tenantId, venueId: owner.venueId };

    // 1. Rooms & Zones
    const room = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [owner.venueId, 'Main Floor'],
    );
    const roomId = room.rows[0].id;

    const vipZone = await app.db.query<{ id: string }>(
      'INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, $3) RETURNING id',
      [owner.venueId, roomId, 'VIP Lounge'],
    );
    const vipZoneId = vipZone.rows[0].id;

    // 2. Resources: Standard PC and VIP PC
    const r1 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, type, name, status, bookable)
       VALUES ($1, $2, 'PC', 'PC-STANDALONE-01', 'AVAILABLE', true) RETURNING id`,
      [owner.venueId, roomId],
    );
    standardPcId = r1.rows[0].id;

    const r2 = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable)
       VALUES ($1, $2, $3, 'PC', 'VIP-STATION-01', 'AVAILABLE', true) RETURNING id`,
      [owner.venueId, roomId, vipZoneId],
    );
    vipPcId = r2.rows[0].id;

    // 3. Price Rules: Venue Default (30.00 RON) and VIP Zone Override (50.00 RON)
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency)
       VALUES ($1, 'VENUE_DEFAULT', NULL, 3000, 'RON')`,
      [owner.venueId],
    );
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency)
       VALUES ($1, 'ZONE', $2, 5000, 'RON')`,
      [owner.venueId, vipZoneId],
    );

    // 4. Default Policy Profile (40% deposit, 3h cancellation)
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Standard Venue Policy', true, '{"prepaid_mode": "DEPOSIT", "deposit_percentage": 40, "deposit_mode_settlement": "ONLINE_OR_RECEPTION", "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 3, "late_cancellation_penalty_percent": 25, "no_show_grace_minutes": 15}')`,
      [owner.venueId],
    );
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  // ===========================================================================
  // 1. Policy Preview Estimates & Scenarios
  // ===========================================================================
  describe('Policy Preview Estimates & Realistic Scenarios', () => {
    it('returns standard estimates (1h, 2h, 3h, 5-seat group) with penny-accurate calculations and Romanian disclosures', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        { headers: { cookie: owner.cookie } },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;

      expect(data.venue_id).toBe(owner.venueId);
      expect(data.base_hourly_rate_minor).toBe(3000);
      expect(data.currency).toBe('RON');
      expect(data.applied_policy_level).toBe('venue_default');

      // Verify scenarios
      expect(data.scenarios.length).toBe(4);

      // Scenario 1: Solo 1h
      const solo1h = data.scenarios.find((s: any) => s.scenario_id === 'solo_1h');
      expect(solo1h).toBeDefined();
      expect(solo1h.total_price_minor).toBe(3000); // 30.00 RON
      expect(solo1h.due_now_minor).toBe(1200); // 40% of 30.00 RON = 12.00 RON
      expect(solo1h.remaining_balance_minor).toBe(1800); // 18.00 RON
      expect(solo1h.cancellation_deadline_hours).toBe(3);
      expect(solo1h.customer_display.price_formatted).toBe('30.00 RON');
      expect(solo1h.customer_display.due_now_formatted).toBe('12.00 RON');
      expect(solo1h.customer_display.balance_formatted).toBe('18.00 RON');
      expect(solo1h.customer_display.free_cancellation_text).toContain('3 ore');

      // Scenario 4: Group 5 Players (2h)
      const group5p = data.scenarios.find((s: any) => s.scenario_id === 'group_5p_2h');
      expect(group5p).toBeDefined();
      expect(group5p.total_price_minor).toBe(30000); // 5 players * 2h * 30 RON = 300 RON
      expect(group5p.due_now_minor).toBe(12000); // 40% = 120 RON
      expect(group5p.remaining_balance_minor).toBe(18000); // 180 RON
      expect(group5p.per_player_share_minor).toBe(6000); // 60 RON / player
      expect(group5p.per_player_due_now_minor).toBe(2400); // 24 RON / player

      // Disclosures
      expect(data.customer_disclosures.free_cancellation_disclosure).toContain('3 ore');
      expect(data.customer_disclosures.deposit_disclosure).toContain('40%');
      expect(data.customer_disclosures.statutory_notice).toContain('OUG 34/2014');
      expect(data.customer_disclosures.statutory_notice).toContain('OUG 28/1999');
    });

    it('resolves resource-specific override pricing for VIP workstations', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates?resource_id=${vipPcId}`,
        { headers: { cookie: owner.cookie } },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;

      expect(data.preview_resource_id).toBe(vipPcId);
      expect(data.base_hourly_rate_minor).toBe(5000); // VIP Zone override rate 50.00 RON

      const solo1h = data.scenarios.find((s: any) => s.scenario_id === 'solo_1h');
      expect(solo1h.total_price_minor).toBe(5000);
      expect(solo1h.due_now_minor).toBe(2000); // 40% of 50.00 = 20.00 RON
      expect(solo1h.remaining_balance_minor).toBe(3000);
    });

    it('surfaces resource inventory comparison table showing rate deltas from venue default', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        { headers: { cookie: owner.cookie } },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;

      expect(data.resource_comparisons.length).toBeGreaterThanOrEqual(2);

      const standardItem = data.resource_comparisons.find((r: any) => r.resource_id === standardPcId);
      expect(standardItem.rate_source).toBe('VENUE_DEFAULT');
      expect(standardItem.effective_hourly_rate_minor).toBe(3000);
      expect(standardItem.diff_from_venue_default_minor).toBe(0);

      const vipItem = data.resource_comparisons.find((r: any) => r.resource_id === vipPcId);
      expect(vipItem.rate_source).toBe('ZONE');
      expect(vipItem.effective_hourly_rate_minor).toBe(5000);
      expect(vipItem.diff_from_venue_default_minor).toBe(2000); // +20.00 RON higher
    });
  });

  // ===========================================================================
  // 2. Real-Time Draft Preview Simulation (POST)
  // ===========================================================================
  describe('Real-Time Draft Policy Simulation (POST)', () => {
    it('simulates customized draft policies without committing changes to database', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        {
          headers: { cookie: owner.cookie },
          body: {
            settings: {
              deposit_percentage: 60,
              free_cancellation_hours: 6,
              deposit_mode_settlement: 'ONLINE_ONLY',
              late_cancellation_penalty_percent: 50,
            },
          },
        },
      );

      expect(res.status).toBe(200);
      const data = res.json as any;

      expect(data.applied_policy_level).toBe('custom_draft');
      expect(data.effective_settings.deposit_percentage).toBe(60);
      expect(data.effective_settings.free_cancellation_hours).toBe(6);
      expect(data.effective_settings.deposit_mode_settlement).toBe('ONLINE_ONLY');

      // Verify that scenario reflects 60% deposit
      const solo1h = data.scenarios.find((s: any) => s.scenario_id === 'solo_1h');
      expect(solo1h.due_now_minor).toBe(1800); // 60% of 30.00 RON = 18.00 RON
      expect(solo1h.remaining_balance_minor).toBe(1200);
      expect(solo1h.customer_display.due_now_formatted).toBe('18.00 RON');
      expect(solo1h.customer_display.free_cancellation_text).toContain('6 ore');
      expect(solo1h.customer_display.settlement_options_text).toContain('exclusiv online');

      // Confirm DB record was NOT mutated
      const dbCheck = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        { headers: { cookie: owner.cookie } },
      );
      expect((dbCheck.json as any).effective_settings.deposit_percentage).toBe(40);
    });
  });

  // ===========================================================================
  // 3. Security, Access Control, and RBAC
  // ===========================================================================
  describe('Security and Access Control', () => {
    it('allows Reception staff read-only access to preview estimates', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        { headers: { cookie: reception.cookie } },
      );
      expect(res.status).toBe(200);
    });

    it('rejects Reception staff from POST draft preview (Owner / Manager only)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        {
          headers: { cookie: reception.cookie },
          body: { settings: { deposit_percentage: 50 } },
        },
      );
      expect([403, 404]).toContain(res.status);
    });

    it('prohibits customers from viewing dashboard policy preview estimates', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
        { headers: { cookie: customer.cookie } },
      );
      expect([403, 404]).toContain(res.status);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${owner.venueId}/policies/preview-estimates`,
      );
      expect(res.status).toBe(401);
    });
  });
});
