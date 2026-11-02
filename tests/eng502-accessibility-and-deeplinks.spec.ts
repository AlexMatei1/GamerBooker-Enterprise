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

describe('ENG-502 Customer Accessibility, Deep Links, and Mandatory Mobile App Install Funnel', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let foreignFixture: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let roomId: string;
  let zoneId: string;
  let pc1Id: string;
  let pc2Id: string;

  beforeAll(async () => {
    app = await startTestApp('eng502');
    fixtures = await createVenueWithRoles(app, 'CyberZone SRL', 'CyberZone Promenada');
    foreignFixture = await createVenueWithRoles(app, 'Foreign Arena SRL', 'Foreign Club Cluj');

    // Default policy
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Default Policy', true, '{"prepaid_mode": "FULL", "deposit_percentage": 100, "allow_online_remaining": true, "min_duration_minutes": 60, "max_duration_minutes": 360, "slot_granularity_minutes": 30, "buffer_after_minutes": 0, "free_cancellation_hours": 24, "late_cancellation_penalty_percent": 50}')`,
      [fixtures.venueId],
    );

    // Default hourly price rule (25.00 RON/h = 2500 bani)
    await app.db.query(
      `INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency)
       VALUES ($1, 'VENUE_DEFAULT', 2500, 'RON')`,
      [fixtures.venueId],
    );

    // Setup room, zone, and resources with rich attributes for accessibility testing
    const roomRes = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Main Stage Arena'],
    );
    roomId = roomRes.rows[0].id;

    const zoneRes = await app.db.query<{ id: string }>(
      'INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, $3) RETURNING id',
      [fixtures.venueId, roomId, 'VIP Pro Row'],
    );
    zoneId = zoneRes.rows[0].id;

    const pc1Res = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable, attributes)
       VALUES ($1, $2, $3, 'PC', 'PC-STAGE-01', 'AVAILABLE', true, '{"cpu": "Intel i9-13900K", "gpu": "RTX 4080", "ram": "32GB DDR5", "monitor": "240Hz IPS"}'::jsonb)
       RETURNING id`,
      [fixtures.venueId, roomId, zoneId],
    );
    pc1Id = pc1Res.rows[0].id;

    const pc2Res = await app.db.query<{ id: string }>(
      `INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable, attributes)
       VALUES ($1, $2, $3, 'PC', 'PC-STAGE-02', 'MAINTENANCE', false, '{"cpu": "Intel i7-13700K", "gpu": "RTX 4070"}'::jsonb)
       RETURNING id`,
      [fixtures.venueId, roomId, zoneId],
    );
    pc2Id = pc2Res.rows[0].id;
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('Deep Link Resolver & User-Agent Detection', () => {
    it('detects iOS platform and returns app scheme with App Store fallback', async () => {
      const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
      const res = await app.call('GET', `/v1/deeplink/resolve?venue_id=${fixtures.venueId}&zone_id=${zoneId}&source_tag=table_qr_05`, {
        headers: { 'user-agent': iosUA },
      });

      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(json.platform).toBe('IOS');
      expect(json.app_url).toContain(`gamerbooker://venues/${fixtures.venueId}`);
      expect(json.store_url).toContain('apps.apple.com');
      expect(json.deferred_token).toBeTruthy();
      expect(json.web_checkout_permitted).toBe(false);
      expect(json.venue_details.name).toBe('CyberZone Promenada');
    });

    it('detects Android platform and returns Intent scheme with Google Play fallback', async () => {
      const androidUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
      const res = await app.call('GET', `/v1/deeplink/resolve?venue_id=${fixtures.venueId}`, {
        headers: { 'user-agent': androidUA },
      });

      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(json.platform).toBe('ANDROID');
      expect(json.target_redirect_url).toContain('intent://');
      expect(json.target_redirect_url).toContain('ro.gamerbooker.app');
      expect(json.store_url).toContain('play.google.com');
    });

    it('detects Desktop Web and returns informational landing page with app download notice', async () => {
      const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';
      const res = await app.call('GET', `/v1/deeplink/resolve?venue_id=${fixtures.venueId}`, {
        headers: { 'user-agent': desktopUA },
      });

      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(json.platform).toBe('DESKTOP_WEB');
      expect(json.target_redirect_url).toContain('gamerbooker.ro/venues');
      expect(json.web_checkout_permitted).toBe(false);
      expect(json.notice).toContain('exclusiv din aplicația mobilă');
    });
  });

  describe('Mandatory Mobile App Install Funnel & Web Checkout Prohibition', () => {
    it('strictly prohibits web browser checkout (403 WEB_CHECKOUT_PROHIBITED)', async () => {
      const res = await app.call('POST', '/v1/checkout/web', {
        body: { venue_id: fixtures.venueId, resource_id: pc1Id },
      });

      expect(res.status).toBe(403);
      const err = (res.json as any).error || (res.json as any);
      expect(err.code).toBe('WEB_CHECKOUT_PROHIBITED');
      expect(err.message).toContain('aplicația mobilă');
    });
  });

  describe('Deferred Deep Linking Across Store Installation', () => {
    let deferredToken: string;

    it('creates deferred deep link token preserving venue and zone context', async () => {
      const createRes = await app.call('POST', '/v1/deeplink/deferred', {
        body: {
          venue_id: fixtures.venueId,
          zone_id: zoneId,
          metadata: { campaign: 'autumn_lan_2026' },
        },
      });

      expect(createRes.status).toBe(201);
      const json = createRes.json as any;
      expect(json.token).toMatch(/^dlnk_/);
      expect(json.venue_id).toBe(fixtures.venueId);
      expect(json.zone_id).toBe(zoneId);
      expect(json.consumed).toBe(false);
      deferredToken = json.token;
    });

    it('resolves deferred deep link upon mobile app initial launch and marks it consumed', async () => {
      const getRes = await app.call('GET', `/v1/deeplink/deferred/${deferredToken}`);
      expect(getRes.status).toBe(200);
      const json = getRes.json as any;
      expect(json.venue_id).toBe(fixtures.venueId);
      expect(json.zone_id).toBe(zoneId);
      expect(json.metadata.campaign).toBe('autumn_lan_2026');
      expect(json.consumed).toBe(true);

      // Subsequent retrieval confirms consumed state
      const reGetRes = await app.call('GET', `/v1/deeplink/deferred/${deferredToken}`);
      expect(reGetRes.status).toBe(200);
      expect((reGetRes.json as any).consumed).toBe(true);
    });

    it('returns 404 for non-existent deferred deep link token', async () => {
      const missingRes = await app.call('GET', '/v1/deeplink/deferred/dlnk_nonexistent12345');
      expect(missingRes.status).toBe(404);
    });
  });

  describe('On-Site QR Funnel Analytics & Conversion Tracking', () => {
    const sessionId = `test-sess-${Date.now()}`;

    it('records anonymous QR conversion funnel milestones', async () => {
      // 1. Scanned
      const r1 = await app.call('POST', '/v1/analytics/qr-funnel', {
        body: { venue_id: fixtures.venueId, session_id: sessionId, milestone: 'SCANNED', platform: 'IOS' },
      });
      expect(r1.status).toBe(200);

      // 2. Store redirected
      const r2 = await app.call('POST', '/v1/analytics/qr-funnel', {
        body: { venue_id: fixtures.venueId, session_id: sessionId, milestone: 'STORE_REDIRECTED', platform: 'IOS' },
      });
      expect(r2.status).toBe(200);

      // 3. App opened
      const r3 = await app.call('POST', '/v1/analytics/qr-funnel', {
        body: { venue_id: fixtures.venueId, session_id: sessionId, milestone: 'APP_OPENED', platform: 'IOS' },
      });
      expect(r3.status).toBe(200);

      // 4. Booking completed
      const r4 = await app.call('POST', '/v1/analytics/qr-funnel', {
        body: { venue_id: fixtures.venueId, session_id: sessionId, milestone: 'BOOKING_COMPLETED', platform: 'IOS' },
      });
      expect(r4.status).toBe(200);
    });

    it('allows venue staff to view on-site QR conversion analytics summary', async () => {
      const analyticsRes = await app.call('GET', `/v1/dashboard/venues/${fixtures.venueId}/analytics/qr-funnel`, {
        headers: { cookie: fixtures.manager.cookie },
      });

      expect(analyticsRes.status).toBe(200);
      const analytics = analyticsRes.json as any;
      expect(analytics.venue_id).toBe(fixtures.venueId);
      expect(analytics.total_scans).toBeGreaterThanOrEqual(1);
      expect(analytics.store_redirects).toBeGreaterThanOrEqual(1);
      expect(analytics.bookings_completed).toBeGreaterThanOrEqual(1);
      expect(analytics.by_platform.IOS).toBeGreaterThanOrEqual(1);
    });

    it('enforces cross-venue boundary on funnel analytics (404 RESOURCE_NOT_FOUND)', async () => {
      const crossRes = await app.call('GET', `/v1/dashboard/venues/${fixtures.venueId}/analytics/qr-funnel`, {
        headers: { cookie: foreignFixture.manager.cookie },
      });
      expect(crossRes.status).toBe(404);
    });
  });

  describe('Customer Accessibility Layout View (WCAG 2.1 / EN 301 549)', () => {
    it('generates non-visual accessible layout hierarchy with screen reader attributes and high-contrast color tokens', async () => {
      const accessRes = await app.call('GET', `/v1/venues/${fixtures.venueId}/layout/accessible-view`);

      expect(accessRes.status).toBe(200);
      const layout = accessRes.json as any;

      expect(layout.venue_id).toBe(fixtures.venueId);
      expect(layout.venue_name).toBe('CyberZone Promenada');
      expect(layout.total_stations).toBe(2);
      expect(layout.available_stations).toBe(1);
      expect(layout.accessibility_statement).toContain('EN 301 549');

      // Rooms
      expect(layout.rooms.length).toBe(1);
      const room = layout.rooms[0];
      expect(room.name).toBe('Main Stage Arena');

      // Zones
      expect(room.zones.length).toBe(1);
      const zone = room.zones[0];
      expect(zone.name).toBe('VIP Pro Row');
      expect(zone.resource_count).toBe(2);
      expect(zone.available_count).toBe(1);

      // Resources
      const pc1 = zone.resources.find((r: any) => r.id === pc1Id);
      const pc2 = zone.resources.find((r: any) => r.id === pc2Id);

      // Available PC
      expect(pc1).toBeDefined();
      expect(pc1.status_token).toBe('AVAILABLE_FOR_BOOKING');
      expect(pc1.contrast_color_token).toBe('#1B5E20'); // WCAG AAA green
      expect(pc1.formatted_price).toBe('25.00 RON/h');
      expect(pc1.aria_label).toContain('PC-STAGE-01');
      expect(pc1.aria_label).toContain('RTX 4080');
      expect(pc1.aria_label).toContain('25.00 RON pe oră');
      expect(pc1.voiceover_text).toContain('Disponibil pentru rezervare');

      // Maintenance PC
      expect(pc2).toBeDefined();
      expect(pc2.status_token).toBe('UNDER_MAINTENANCE');
      expect(pc2.contrast_color_token).toBe('#E65100'); // Amber
      expect(pc2.status_label).toContain('mentenanță');
      expect(pc2.aria_label).toContain('În mentenanță tehnică');
    });

    it('returns 404 for non-existent venue accessible layout query', async () => {
      const nonExistent = await app.call('GET', '/v1/venues/00000000-0000-0000-0000-000000000000/layout/accessible-view');
      expect(nonExistent.status).toBe(404);
    });
  });
});
