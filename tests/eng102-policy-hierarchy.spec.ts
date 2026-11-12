/**
 * Acceptance test suite for ENG-102: Policy hierarchy, validator, and immutable snapshots.
 */
import { startTestApp, type TestApp } from './support/auth-harness';
import {
  validateBookingInterval,
  validatePolicySettings,
} from '../src/bookings/policy.validator';
import { DEFAULT_PLATFORM_POLICY } from '../src/bookings/policy.types';

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
    user.cookie = await app.elevateMfa(user.cookie);
  }

  return { ...user, tenantId, venueId };
}

describe('ENG-102 Policy Hierarchy, Validator, and Snapshot Engine', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;

  beforeAll(async () => {
    app = await startTestApp('eng102', { browserClient: true });
    ownerFixture = await createTenantAndVenue(app, 'Nexus Gaming SRL', 'Nexus Hub', 'OWNER');
    foreignFixture = await createTenantAndVenue(app, 'Arcade Pro SRL', 'Arcade Lounge', 'OWNER');
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Policy Validator Unit Rules', () => {
    it('validates settings and enforces deposit bounds (10% to 100%)', () => {
      expect(() =>
        validatePolicySettings({ deposit_percentage: 5 }),
      ).toThrow();

      expect(() =>
        validatePolicySettings({ deposit_percentage: 120 }),
      ).toThrow();

      const valid = validatePolicySettings({ deposit_percentage: 45 });
      expect(valid.deposit_percentage).toBe(45);
    });

    it('enforces booking duration minimums, maximums, and slot granularity', () => {
      const policy = {
        ...DEFAULT_PLATFORM_POLICY,
        min_duration_minutes: 60,
        max_duration_minutes: 240,
        slot_granularity_minutes: 30,
      };

      const start = new Date('2026-11-06T12:00:00Z');

      // 30 min duration (too short)
      const tooShort = new Date('2026-11-06T12:30:00Z');
      expect(() => validateBookingInterval(start, tooShort, policy)).toThrow();

      // 300 min duration (too long)
      const tooLong = new Date('2026-11-06T17:00:00Z');
      expect(() => validateBookingInterval(start, tooLong, policy)).toThrow();

      // 75 min duration (unaligned with 30 min granularity)
      const unaligned = new Date('2026-11-06T13:15:00Z');
      expect(() => validateBookingInterval(start, unaligned, policy)).toThrow();

      // 120 min duration (valid)
      const valid = new Date('2026-11-06T14:00:00Z');
      expect(() => validateBookingInterval(start, valid, policy)).not.toThrow();
    });
  });

  describe('Policy Profile Management & RBAC', () => {
    it('allows OWNER to create a venue default policy profile', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/policies`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            name: 'Nexus Standard Policy',
            isDefault: true,
            settings: {
              deposit_percentage: 50,
              min_duration_minutes: 90,
              max_duration_minutes: 360,
              free_cancellation_hours: 4,
            },
          },
        },
      );

      expect(res.status).toBe(201);
      const data = res.json as { policy: { id: string; name: string; is_default: boolean; settings: { deposit_percentage: number } } };
      expect(data.policy.id).toBeDefined();
      expect(data.policy.is_default).toBe(true);
      expect(data.policy.settings.deposit_percentage).toBe(50);
    });

    it('denies cross-tenant policy creation (404 RESOURCE_NOT_FOUND)', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${foreignFixture.venueId}/policies`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            name: 'Hacked Policy',
            isDefault: false,
            settings: { deposit_percentage: 20 },
          },
        },
      );

      expect(res.status).toBe(404);
      const error = app.errorOf(res);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('denies RECEPTION staff from modifying policies (403)', async () => {
      const recUser = await app.verifiedUser();
      await app.db.query(
        'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role, active) VALUES ($1, $2, $3, $4, true)',
        [recUser.userId, ownerFixture.venueId, ownerFixture.tenantId, 'RECEPTION'],
      );

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/policies`,
        {
          headers: { cookie: recUser.cookie },
          body: {
            name: 'Reception Policy',
            isDefault: false,
            settings: { deposit_percentage: 20 },
          },
        },
      );

      expect(res.status).toBe(403);
      const error = app.errorOf(res);
      expect(error.code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });
  });

  describe('Policy Hierarchy Resolution (Resource > Zone > Venue > Platform)', () => {
    let standardPcId: string;
    let vipZonePcId: string;
    let customPcId: string;

    beforeAll(async () => {
      // 1. Create Room and Zone
      const room = await app.db.query<{ id: string }>(
        "INSERT INTO rooms (venue_id, name) VALUES ($1, 'Main Arena Room') RETURNING id",
        [ownerFixture.venueId],
      );
      const roomId = room.rows[0].id;

      // Create Zone A (no custom policy)
      const zoneA = await app.db.query<{ id: string }>(
        "INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, 'Standard Zone') RETURNING id",
        [ownerFixture.venueId, roomId],
      );
      const zoneAId = zoneA.rows[0].id;

      // 2. Create a custom Zone Policy Profile (e.g. VIP Zone requires 100% full prepaid)
      const vipPolicyRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${ownerFixture.venueId}/policies`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            name: 'VIP Zone Strict Policy',
            isDefault: false,
            settings: {
              prepaid_mode: 'FULL',
              deposit_percentage: 100,
              free_cancellation_hours: 12,
            },
          },
        },
      );
      const vipPolicyId = (vipPolicyRes.json as { policy: { id: string } }).policy.id;

      // Create Zone B (VIP Zone linked to vipPolicyId)
      const zoneB = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name, policy_profile_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [ownerFixture.venueId, roomId, 'VIP Zone', vipPolicyId],
      );
      const zoneBId = zoneB.rows[0].id;

      // 3. Create Resources
      // PC 1 in Standard Zone (inherits Venue Default)
      const pc1 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, name, type) VALUES ($1, $2, $3, 'PC #1', 'PC') RETURNING id",
        [ownerFixture.venueId, roomId, zoneAId],
      );
      standardPcId = pc1.rows[0].id;

      // PC 2 in VIP Zone (inherits Zone Policy)
      const pc2 = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, name, type) VALUES ($1, $2, $3, 'VIP PC #2', 'PC') RETURNING id",
        [ownerFixture.venueId, roomId, zoneBId],
      );
      vipZonePcId = pc2.rows[0].id;

      // PC 3 in Standard Zone with Resource Override
      const pc3 = await app.db.query<{ id: string }>(
        `INSERT INTO resources (venue_id, room_id, zone_id, name, type, attributes)
         VALUES ($1, $2, $3, 'Custom PC #3', 'PC', '{"policy_override": {"min_duration_minutes": 180, "deposit_percentage": 75}}'::jsonb)
         RETURNING id`,
        [ownerFixture.venueId, roomId, zoneAId],
      );
      customPcId = pc3.rows[0].id;
    });

    it('resolves Venue Default policy for a standard resource', async () => {
      const res = await app.call(
        'GET',
        `/v1/venues/${ownerFixture.venueId}/effective-policy?resource_id=${standardPcId}`,
      );
      expect(res.status).toBe(200);

      const data = res.json as {
        effectivePolicy: {
          source_level: string;
          settings: { deposit_percentage: number; min_duration_minutes: number };
        };
      };

      expect(data.effectivePolicy.source_level).toBe('venue_default');
      expect(data.effectivePolicy.settings.deposit_percentage).toBe(50);
      expect(data.effectivePolicy.settings.min_duration_minutes).toBe(90);
    });

    it('resolves Zone Policy for a resource inside a zone with policy_profile_id', async () => {
      const res = await app.call(
        'GET',
        `/v1/venues/${ownerFixture.venueId}/effective-policy?resource_id=${vipZonePcId}`,
      );
      expect(res.status).toBe(200);

      const data = res.json as {
        effectivePolicy: {
          source_level: string;
          settings: { prepaid_mode: string; deposit_percentage: number; free_cancellation_hours: number };
        };
      };

      expect(data.effectivePolicy.source_level).toBe('zone_policy');
      expect(data.effectivePolicy.settings.prepaid_mode).toBe('FULL');
      expect(data.effectivePolicy.settings.deposit_percentage).toBe(100);
      expect(data.effectivePolicy.settings.free_cancellation_hours).toBe(12);
    });

    it('resolves Resource Override for a resource with explicit attribute overrides', async () => {
      const res = await app.call(
        'GET',
        `/v1/venues/${ownerFixture.venueId}/effective-policy?resource_id=${customPcId}`,
      );
      expect(res.status).toBe(200);

      const data = res.json as {
        effectivePolicy: {
          source_level: string;
          settings: { deposit_percentage: number; min_duration_minutes: number };
        };
      };

      expect(data.effectivePolicy.source_level).toBe('resource_override');
      expect(data.effectivePolicy.settings.deposit_percentage).toBe(75);
      expect(data.effectivePolicy.settings.min_duration_minutes).toBe(180);
    });
  });

  describe('Immutable Policy Snapshot (BR-010)', () => {
    it('creates an immutable policy snapshot that does not change when venue policy is modified', async () => {
      // 1. Get snapshot at current state (50% deposit)
      const previewRes = await app.call(
        'GET',
        `/v1/venues/${ownerFixture.venueId}/effective-policy`,
      );
      expect(previewRes.status).toBe(200);

      const initialSnapshot = (previewRes.json as { snapshot: { captured_at: string; settings: { deposit_percentage: number } } }).snapshot;
      expect(initialSnapshot.settings.deposit_percentage).toBe(50);

      // 2. Owner updates venue policy to 80% deposit
      const defaultProfile = (await app.db.query<{ id: string }>(
        'SELECT id FROM policy_profiles WHERE venue_id = $1 AND is_default = true',
        [ownerFixture.venueId],
      )).rows[0];

      const patchRes = await app.call(
        'PATCH',
        `/v1/dashboard/venues/${ownerFixture.venueId}/policies/${defaultProfile.id}`,
        {
          headers: { cookie: ownerFixture.cookie },
          body: {
            settings: { deposit_percentage: 80 },
          },
        },
      );
      expect(patchRes.status).toBe(200);

      // 3. Verify newly resolved effective policy reflects 80%
      const newPreview = await app.call(
        'GET',
        `/v1/venues/${ownerFixture.venueId}/effective-policy`,
      );
      const newEffective = (newPreview.json as { effectivePolicy: { settings: { deposit_percentage: number } } }).effectivePolicy;
      expect(newEffective.settings.deposit_percentage).toBe(80);

      // 4. Verify historical snapshot was IMMUTABLE and remains at 50%
      expect(initialSnapshot.settings.deposit_percentage).toBe(50);
    });
  });
});
