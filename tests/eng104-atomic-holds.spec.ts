/**
 * Acceptance test suite for ENG-104: Atomic hold + private room component closure + expiry worker.
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

describe('ENG-104 Atomic Hold + Private Room Component Closure + Expiry Worker', () => {
  let app: TestApp;
  let ownerFixture: Fixture;
  let foreignFixture: Fixture;
  let customerA: { userId: string; cookie: string };
  let customerB: { userId: string; cookie: string };

  let roomId: string;
  let zoneId: string;
  let standardPc1Id: string;
  let standardPc2Id: string;
  let privateRoomId: string;
  let roomChildPc1Id: string;
  let roomChildPc2Id: string;

  beforeAll(async () => {
    try {
      app = await startTestApp('eng104');
      ownerFixture = await createTenantAndVenue(app, 'Nexus Gaming SRL', 'Nexus Arena', 'OWNER');
      foreignFixture = await createTenantAndVenue(app, 'RedLine Arena SRL', 'RedLine Hub', 'OWNER');

      customerA = await app.verifiedUser();
      customerB = await app.verifiedUser();

      // Setup room and zone
      const roomRes = await app.db.query<{ id: string }>(
        'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
        [ownerFixture.venueId, 'Main Floor'],
      );
      roomId = roomRes.rows[0].id;

      const zoneRes = await app.db.query<{ id: string }>(
        'INSERT INTO zones (venue_id, room_id, name) VALUES ($1, $2, $3) RETURNING id',
        [ownerFixture.venueId, roomId, 'Standard Zone'],
      );
      zoneId = zoneRes.rows[0].id;

      // Create 2 standalone PCs
      const pc1Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-STANDALONE-1', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      standardPc1Id = pc1Res.rows[0].id;

      const pc2Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'PC-STANDALONE-2', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      standardPc2Id = pc2Res.rows[0].id;

      // Create 1 Private Room and 2 child PCs
      const privRoomRes = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PRIVATE_ROOM', 'VIP-BOOTCAMP', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      privateRoomId = privRoomRes.rows[0].id;

      const child1Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'VIP-PC-1', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      roomChildPc1Id = child1Res.rows[0].id;

      const child2Res = await app.db.query<{ id: string }>(
        "INSERT INTO resources (venue_id, room_id, zone_id, type, name, status, bookable) VALUES ($1, $2, $3, 'PC', 'VIP-PC-2', 'AVAILABLE', true) RETURNING id",
        [ownerFixture.venueId, roomId, zoneId],
      );
      roomChildPc2Id = child2Res.rows[0].id;

      // Link Private Room to child PCs in resource_components
      await app.db.query(
        'INSERT INTO resource_components (parent_resource_id, child_resource_id, venue_id) VALUES ($1, $2, $3), ($1, $4, $3)',
        [privateRoomId, roomChildPc1Id, ownerFixture.venueId, roomChildPc2Id],
      );

      // Default hourly price rule: 3000 bani (30.00 RON/h)
      await app.db.query(
        "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')",
        [ownerFixture.venueId],
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

  async function createQuote(
    userCookie: string,
    venueId: string,
    resourceIds: string[],
    startsAt: string,
    endsAt: string,
  ) {
    const res = await app.call('POST', '/v1/quotes', {
      headers: { cookie: userCookie },
      body: {
        venue_id: venueId,
        resource_ids: resourceIds,
        starts_at: startsAt,
        ends_at: endsAt,
      },
    });
    expect(res.status).toBe(201);
    return res.json as {
      quote_id: string;
      total_minor: number;
      due_now_minor: number;
      expires_at: string;
      signature: string;
    };
  }

  describe('Component Closure Integrity & Outbox Event', () => {
    it('expanding private room atomically locks parent room and all child PCs', async () => {
      // 1. Create quote for private room
      const startsAt = '2026-11-01T14:00:00.000Z';
      const endsAt = '2026-11-01T16:00:00.000Z';

      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [privateRoomId], startsAt, endsAt);

      // 2. Customer creates hold via API
      const res = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quote.quote_id },
      });

      expect(res.status).toBe(201);
      const hold = res.json as {
        id: string;
        status: string;
        resource_ids: string[];
        atomic_resource_ids: string[];
      };
      expect(hold.status).toBe('ACTIVE');
      expect(hold.resource_ids).toEqual([privateRoomId]);

      // Atomic resource IDs must contain all 3: parent room + both child PCs
      expect(hold.atomic_resource_ids).toHaveLength(3);
      expect(hold.atomic_resource_ids).toContain(privateRoomId);
      expect(hold.atomic_resource_ids).toContain(roomChildPc1Id);
      expect(hold.atomic_resource_ids).toContain(roomChildPc2Id);

      // 3. Verify PostgreSQL claims table has 3 active claims
      const claimsRes = await app.db.query<{ resource_id: string; state: string }>(
        'SELECT resource_id, state FROM resource_claims WHERE hold_id = $1',
        [hold.id],
      );
      expect(claimsRes.rows).toHaveLength(3);
      expect(claimsRes.rows.every((c) => c.state === 'ACTIVE_HOLD')).toBe(true);

      // 4. Verify transactional outbox event
      const outboxRes = await app.db.query<{ event_type: string; payload: any }>(
        "SELECT event_type, payload FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'HoldCreated'",
        [hold.id],
      );
      expect(outboxRes.rows).toHaveLength(1);
      expect(outboxRes.rows[0].payload.hold_id).toBe(hold.id);
      expect(outboxRes.rows[0].payload.customer_id).toBe(customerA.userId);
    });
  });

  describe('Bi-Directional DAG Component Collision (GiST Exclusion)', () => {
    it('child PC hold blocks subsequent private room hold (409 RESOURCE_UNAVAILABLE)', async () => {
      const startsAt = '2026-11-02T10:00:00.000Z';
      const endsAt = '2026-11-02T12:00:00.000Z';

      // Customer A holds child PC 1
      const childQuote = await createQuote(customerA.cookie, ownerFixture.venueId, [roomChildPc1Id], startsAt, endsAt);

      const childHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: childQuote.quote_id },
      });
      expect(childHoldRes.status).toBe(201);

      // Customer B attempts to hold private room (which includes child PC 1)
      const roomQuote = await createQuote(customerB.cookie, ownerFixture.venueId, [privateRoomId], startsAt, endsAt);

      const roomHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerB.cookie },
        body: { quote_id: roomQuote.quote_id },
      });

      expect(roomHoldRes.status).toBe(409);
      const err = app.errorOf(roomHoldRes);
      expect(err.code).toBe('RESOURCE_UNAVAILABLE');
    });

    it('private room hold blocks subsequent child PC hold (409 RESOURCE_UNAVAILABLE)', async () => {
      const startsAt = '2026-11-02T14:00:00.000Z';
      const endsAt = '2026-11-02T16:00:00.000Z';

      // Customer A holds private room
      const roomQuote = await createQuote(customerA.cookie, ownerFixture.venueId, [privateRoomId], startsAt, endsAt);

      const roomHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: roomQuote.quote_id },
      });
      expect(roomHoldRes.status).toBe(201);

      // Customer B attempts to hold child PC 2
      const childQuote = await createQuote(customerB.cookie, ownerFixture.venueId, [roomChildPc2Id], startsAt, endsAt);

      const childHoldRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerB.cookie },
        body: { quote_id: childQuote.quote_id },
      });

      expect(childHoldRes.status).toBe(409);
      const err = app.errorOf(childHoldRes);
      expect(err.code).toBe('RESOURCE_UNAVAILABLE');
    });
  });

  describe('Concurrency & Race Condition Safety', () => {
    it('concurrent hold requests on identical resource produce exactly 1 hold and 1 409 conflict', async () => {
      const startsAt = '2026-11-03T18:00:00.000Z';
      const endsAt = '2026-11-03T20:00:00.000Z';

      // Both customers obtain valid quotes for standard PC 1
      const quoteA = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);
      const quoteB = await createQuote(customerB.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);

      // Submit both hold requests simultaneously
      const [resA, resB] = await Promise.all([
        app.call('POST', '/v1/holds', {
          headers: { cookie: customerA.cookie },
          body: { quote_id: quoteA.quote_id },
        }),
        app.call('POST', '/v1/holds', {
          headers: { cookie: customerB.cookie },
          body: { quote_id: quoteB.quote_id },
        }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Exactly 1 active claim in database
      const activeClaims = await app.db.query(
        "SELECT * FROM resource_claims WHERE resource_id = $1 AND state = 'ACTIVE_HOLD'",
        [standardPc1Id],
      );
      expect(activeClaims.rows).toHaveLength(1);
    });
  });

  describe('Hold Expiry Worker & TTL Recovery', () => {
    it('automatically releases expired hold claims and allows resource re-booking', async () => {
      const startsAt = '2026-11-04T10:00:00.000Z';
      const endsAt = '2026-11-04T12:00:00.000Z';

      // Customer A holds PC 2
      const quoteA = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc2Id], startsAt, endsAt);

      const holdResA = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quoteA.quote_id },
      });
      expect(holdResA.status).toBe(201);
      const holdA = holdResA.json as { id: string };

      // Simulate TTL expiration: advance expires_at into the past
      await app.db.query(
        "UPDATE holds SET expires_at = now() - interval '5 seconds' WHERE id = $1",
        [holdA.id],
      );

      // Trigger expiry worker
      const cleanupRes = await app.call('POST', '/v1/holds/cleanup-expired');
      expect(cleanupRes.status).toBe(201);
      const cleanupData = cleanupRes.json as { expired_count: number };
      expect(cleanupData.expired_count).toBeGreaterThanOrEqual(1);

      // Verify hold status and claim status
      const updatedHold = await app.db.query<{ status: string }>('SELECT status FROM holds WHERE id = $1', [
        holdA.id,
      ]);
      expect(updatedHold.rows[0].status).toBe('EXPIRED');

      const updatedClaims = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE hold_id = $1',
        [holdA.id],
      );
      expect(updatedClaims.rows[0].state).toBe('RELEASED');

      // Verify outbox has HoldExpired event
      const outboxRes = await app.db.query(
        "SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'HoldExpired'",
        [holdA.id],
      );
      expect(outboxRes.rows).toHaveLength(1);

      // Customer B can now immediately hold standard PC 2 without conflict
      const quoteB = await createQuote(customerB.cookie, ownerFixture.venueId, [standardPc2Id], startsAt, endsAt);

      const holdResB = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerB.cookie },
        body: { quote_id: quoteB.quote_id },
      });
      expect(holdResB.status).toBe(201);
      const holdB = holdResB.json as { status: string };
      expect(holdB.status).toBe('ACTIVE');
    });
  });

  describe('Idempotency & Explicit Release API', () => {
    it('idempotent creation with Idempotency-Key returns existing hold without duplicate claims', async () => {
      const startsAt = '2026-11-05T14:00:00.000Z';
      const endsAt = '2026-11-05T16:00:00.000Z';

      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);

      const idempotencyKey = 'idem-hold-test-key-999';

      const res1 = await app.call('POST', '/v1/holds', {
        headers: {
          cookie: customerA.cookie,
          'idempotency-key': idempotencyKey,
        },
        body: { quote_id: quote.quote_id },
      });
      expect(res1.status).toBe(201);
      const hold1 = res1.json as { id: string };

      // Replay with identical idempotency key
      const res2 = await app.call('POST', '/v1/holds', {
        headers: {
          cookie: customerA.cookie,
          'idempotency-key': idempotencyKey,
        },
        body: { quote_id: quote.quote_id },
      });
      expect(res2.status).toBe(201);
      const hold2 = res2.json as { id: string };

      expect(hold2.id).toBe(hold1.id);

      // Verify no duplicate claims
      const claimsRes = await app.db.query(
        'SELECT * FROM resource_claims WHERE hold_id = $1',
        [hold1.id],
      );
      expect(claimsRes.rows).toHaveLength(1);
    });

    it('explicit release immediately frees resource claims and is idempotent', async () => {
      const startsAt = '2026-11-06T18:00:00.000Z';
      const endsAt = '2026-11-06T20:00:00.000Z';

      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);

      const holdRes = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quote.quote_id },
      });
      expect(holdRes.status).toBe(201);
      const hold = holdRes.json as { id: string };

      // Release hold
      const releaseRes1 = await app.call('POST', `/v1/holds/${hold.id}/release`, {
        headers: { cookie: customerA.cookie },
      });
      expect(releaseRes1.status).toBe(201);
      const releasedHold1 = releaseRes1.json as { status: string };
      expect(releasedHold1.status).toBe('RELEASED');

      // Verify DB claim state
      const claimsRes = await app.db.query<{ state: string }>(
        'SELECT state FROM resource_claims WHERE hold_id = $1',
        [hold.id],
      );
      expect(claimsRes.rows[0].state).toBe('RELEASED');

      // Calling release again is idempotent
      const releaseRes2 = await app.call('POST', `/v1/holds/${hold.id}/release`, {
        headers: { cookie: customerA.cookie },
      });
      expect(releaseRes2.status).toBe(201);
      const releasedHold2 = releaseRes2.json as { status: string };
      expect(releasedHold2.status).toBe('RELEASED');
    });
  });

  describe('Security & Validation Guards', () => {
    it('rejects hold creation when quote has expired (400 QUOTE_EXPIRED)', async () => {
      const startsAt = '2026-11-07T12:00:00.000Z';
      const endsAt = '2026-11-07T14:00:00.000Z';

      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);

      // Expire quote in database
      await app.db.query(
        "UPDATE price_quotes SET expires_at = now() - interval '10 seconds' WHERE id = $1",
        [quote.quote_id],
      );

      const res = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quote.quote_id },
      });

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('QUOTE_EXPIRED');
    });

    it('rejects hold creation when quote signature is tampered (400 QUOTE_SIGNATURE_INVALID)', async () => {
      const startsAt = '2026-11-07T15:00:00.000Z';
      const endsAt = '2026-11-07T17:00:00.000Z';

      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc1Id], startsAt, endsAt);

      // Tamper signature in DB
      await app.db.query(
        "UPDATE price_quotes SET signature = 'deadbeefdeadbeef0000111122223333444455556666777788889999aaaabbbb' WHERE id = $1",
        [quote.quote_id],
      );

      const res = await app.call('POST', '/v1/holds', {
        headers: { cookie: customerA.cookie },
        body: { quote_id: quote.quote_id },
      });

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('QUOTE_SIGNATURE_INVALID');
    });

    it('rejects hold creation when resource is in MAINTENANCE (409 RESOURCE_UNAVAILABLE)', async () => {
      const startsAt = '2026-11-08T10:00:00.000Z';
      const endsAt = '2026-11-08T12:00:00.000Z';

      // 1. Create quote while resource is AVAILABLE
      const quote = await createQuote(customerA.cookie, ownerFixture.venueId, [standardPc2Id], startsAt, endsAt);

      // 2. Put resource into MAINTENANCE before hold
      await app.db.query("UPDATE resources SET status = 'MAINTENANCE' WHERE id = $1", [
        standardPc2Id,
      ]);

      try {
        const res = await app.call('POST', '/v1/holds', {
          headers: { cookie: customerA.cookie },
          body: { quote_id: quote.quote_id },
        });

        expect(res.status).toBe(409);
        const err = app.errorOf(res);
        expect(err.code).toBe('RESOURCE_UNAVAILABLE');
      } finally {
        await app.db.query("UPDATE resources SET status = 'AVAILABLE' WHERE id = $1", [
          standardPc2Id,
        ]);
      }
    });
  });
});
