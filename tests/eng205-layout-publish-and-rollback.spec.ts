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

describe('ENG-205 Layout Draft Validation, Atomic Publish, Customer Preview, and Rollback', () => {
  let app: TestApp;
  let fixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let foreignFixtures: { owner: Fixture; manager: Fixture; reception: Fixture; venueId: string; tenantId: string };
  let customerUser: { userId: string; cookie: string };

  let mainRoomId: string;
  let pc1Id: string;
  let pc2Id: string;
  let pc3Id: string;

  beforeAll(async () => {
    app = await startTestApp('eng205');
    fixtures = await createVenueWithRoles(app, 'Apex Gaming Corp SRL', 'Apex Arena Timisoara');
    foreignFixtures = await createVenueWithRoles(app, 'Rival Gaming SRL', 'Rival Lounge Iasi');
    customerUser = await app.verifiedUser();

    // 1. Seed Rooms
    const r1 = await app.db.query<{ id: string }>(
      'INSERT INTO rooms (venue_id, name) VALUES ($1, $2) RETURNING id',
      [fixtures.venueId, 'Pro Arena'],
    );
    mainRoomId = r1.rows[0].id;

    // 2. Seed Default Policy Profile & Price Rules
    await app.db.query(
      `INSERT INTO policy_profiles (venue_id, name, is_default, settings)
       VALUES ($1, 'Standard Arena Policy', true, '{"cancellation_cutoff_hours": 3, "deposit_percentage": 100, "min_duration_minutes": 60, "max_duration_minutes": 480}')`,
      [fixtures.venueId],
    );

    await app.db.query(
      "INSERT INTO price_rules (venue_id, target_type, hourly_rate_minor, currency) VALUES ($1, 'VENUE_DEFAULT', 3000, 'RON')",
      [fixtures.venueId],
    );

    // 3. Seed Resources
    const p1 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'APEX-01', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, mainRoomId],
    );
    pc1Id = p1.rows[0].id;

    const p2 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'APEX-02', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, mainRoomId],
    );
    pc2Id = p2.rows[0].id;

    const p3 = await app.db.query<{ id: string }>(
      "INSERT INTO resources (venue_id, room_id, type, name, status, bookable) VALUES ($1, $2, 'PC', 'APEX-03', 'AVAILABLE', true) RETURNING id",
      [fixtures.venueId, mainRoomId],
    );
    pc3Id = p3.rows[0].id;

    // 4. Initialize draft layout with these 3 PCs
    await app.db.query(
      `INSERT INTO layout_drafts (
        venue_id, revision, schema_version, canvas, rooms, layers, nodes
      ) VALUES (
        $1, 1, 1,
        '{"width": 1600, "height": 1000, "grid": 20}'::jsonb,
        $2::jsonb,
        '[{"id": "equipment", "name": "Equipment", "visible": true, "locked": false}]'::jsonb,
        $3::jsonb
      )`,
      [
        fixtures.venueId,
        JSON.stringify([{ id: mainRoomId, name: 'Pro Arena', shape: { kind: 'rect', x: 40, y: 40, w: 600, h: 400 } }]),
        JSON.stringify([
          { id: 'node-pc-1', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc1Id, label: 'APEX-01', x: 60, y: 80, w: 60, h: 40 },
          { id: 'node-pc-2', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc2Id, label: 'APEX-02', x: 140, y: 80, w: 60, h: 40 },
          { id: 'node-pc-3', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc3Id, label: 'APEX-03', x: 220, y: 80, w: 60, h: 40 },
        ]),
      ],
    );
  });

  afterAll(async () => {
    await app.stop();
  });

  // ===========================================================================
  // 1. Pre-publication Validation Engine
  // ===========================================================================
  describe('Pre-publication Validation Engine', () => {
    it('validates a correct draft returning valid: true and resource/room metrics', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/validate`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const val = res.json as any;
      expect(val.valid).toBe(true);
      expect(val.errors.length).toBe(0);
      expect(val.resource_count).toBe(3);
      expect(val.room_count).toBe(1);
    });

    it('detects duplicate resource bindings in scene (DUPLICATE_RESOURCE_IN_SCENE)', async () => {
      // Temporarily update draft to bind pc1Id twice
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-pc-1a', kind: 'RESOURCE', layer_id: 'equipment', resource_id: pc1Id, x: 60, y: 80 },
            { id: 'node-pc-1b', kind: 'RESOURCE', layer_id: 'equipment', resource_id: pc1Id, x: 140, y: 80 },
          ]),
          fixtures.venueId,
        ],
      );

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/validate`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      const val = res.json as any;
      expect(val.valid).toBe(false);
      expect(val.errors.some((e: any) => e.code === 'DUPLICATE_RESOURCE_IN_SCENE')).toBe(true);

      // Restore clean nodes
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-pc-1', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc1Id, label: 'APEX-01', x: 60, y: 80, w: 60, h: 40 },
            { id: 'node-pc-2', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc2Id, label: 'APEX-02', x: 140, y: 80, w: 60, h: 40 },
            { id: 'node-pc-3', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc3Id, label: 'APEX-03', x: 220, y: 80, w: 60, h: 40 },
          ]),
          fixtures.venueId,
        ],
      );
    });

    it('detects non-existent or foreign resource reference (RESOURCE_NOT_FOUND)', async () => {
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-fake', kind: 'RESOURCE', layer_id: 'equipment', resource_id: '00000000-0000-0000-0000-000000000099', x: 60, y: 80 },
          ]),
          fixtures.venueId,
        ],
      );

      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/validate`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );

      expect(res.status).toBe(200);
      const val = res.json as any;
      expect(val.valid).toBe(false);
      expect(val.errors.some((e: any) => e.code === 'RESOURCE_NOT_FOUND')).toBe(true);

      // Restore clean nodes
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-pc-1', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc1Id, label: 'APEX-01', x: 60, y: 80, w: 60, h: 40 },
            { id: 'node-pc-2', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc2Id, label: 'APEX-02', x: 140, y: 80, w: 60, h: 40 },
            { id: 'node-pc-3', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc3Id, label: 'APEX-03', x: 220, y: 80, w: 60, h: 40 },
          ]),
          fixtures.venueId,
        ],
      );
    });
  });

  // ===========================================================================
  // 2. Atomic Publish
  // ===========================================================================
  describe('Atomic Publish Lifecycle', () => {
    let publishedRev1Id: string;

    it('atomically publishes draft into immutable revision 1 and updates venue active pointer', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/publish`,
        {
          headers: { cookie: fixtures.owner.cookie, 'x-request-id': 'req-pub-1' },
          body: {
            expected_draft_revision: 1,
            change_summary: 'Initial production layout release with 3 pro stations',
          },
        },
      );

      expect(res.status).toBe(200);
      const rev = (res.json as any).revision;
      expect(rev.revision_number).toBe(1);
      expect(rev.change_summary).toBe('Initial production layout release with 3 pro stations');
      expect(rev.is_active).toBe(true);
      publishedRev1Id = rev.id;

      // Verify DB pointer in venues table
      const venueCheck = await app.db.query<{ active_layout_revision_id: string }>(
        'SELECT active_layout_revision_id FROM venues WHERE id = $1',
        [fixtures.venueId],
      );
      expect(venueCheck.rows[0].active_layout_revision_id).toBe(publishedRev1Id);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string; target_id: string }>(
        "SELECT action, target_id FROM audit_events WHERE venue_id = $1 AND action = 'LAYOUT_PUBLISHED' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].target_id).toBe(publishedRev1Id);

      // Verify outbox event
      const outboxRes = await app.db.query<{ event_type: string }>(
        "SELECT event_type FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'LayoutPublished'",
        [publishedRev1Id],
      );
      expect(outboxRes.rowCount).toBe(1);
    });

    it('rejects publication when expected_draft_revision is stale (409 LAYOUT_REVISION_CONFLICT)', async () => {
      // Draft is at revision 1, we send expected_draft_revision = 99
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/publish`,
        {
          headers: { cookie: fixtures.manager.cookie },
          body: {
            expected_draft_revision: 99,
          },
        },
      );

      expect(res.status).toBe(409);
      expect(app.errorOf(res).code).toBe('LAYOUT_REVISION_CONFLICT');
    });
  });

  // ===========================================================================
  // 3. Active Booking Deletion Guard on Publication
  // ===========================================================================
  describe('Active Booking Deletion Guard on Publication', () => {
    beforeAll(async () => {
      // Create a confirmed future booking on pc1Id
      const futureStart = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

      const qRes = await app.db.query<{ id: string }>(
        `INSERT INTO price_quotes (
          venue_id, customer_id, starts_at, ends_at,
          items_snapshot, policy_snapshot,
          total_minor, due_now_minor, balance_minor, currency,
          signature, expires_at
        ) VALUES ($1, $2, $3, $4, '[]', '{}', 6000, 6000, 0, 'RON', 'test-sig', $4)
        RETURNING id`,
        [fixtures.venueId, customerUser.userId, futureStart, futureEnd],
      );
      const quoteId = qRes.rows[0].id;

      const bRes = await app.db.query<{ id: string }>(
        `INSERT INTO bookings (
          tenant_id, venue_id, customer_id, quote_id, public_code, status, starts_at, ends_at,
          resource_ids, atomic_resource_ids, total_minor, due_now_minor, paid_minor, balance_minor,
          currency, price_snapshot, policy_snapshot
        ) VALUES ($1, $2, $3, $4, 'GB-GUARD01', 'CONFIRMED', $5, $6, $7, $7, 6000, 6000, 6000, 0, 'RON', '{}', '{}')
        RETURNING id`,
        [fixtures.tenantId, fixtures.venueId, customerUser.userId, quoteId, futureStart, futureEnd, [pc1Id]],
      );
      const bookingId = bRes.rows[0].id;

      // Insert claim
      await app.db.query(
        `INSERT INTO resource_claims (
          resource_id, tenant_id, booking_id, holder_id, claim_type, state, slot
        ) VALUES ($1, $2, $3, $4, 'BOOKING', 'CONFIRMED', tstzrange($5::timestamptz, $6::timestamptz, '[)'))`,
        [pc1Id, fixtures.tenantId, bookingId, customerUser.userId, futureStart, futureEnd],
      );
    });

    it('rejects publishing a layout that deletes PC1 while PC1 has future confirmed bookings', async () => {
      // Modify draft to REMOVE pc1Id (leaving only pc2Id and pc3Id)
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-pc-2', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc2Id, label: 'APEX-02', x: 140, y: 80 },
            { id: 'node-pc-3', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc3Id, label: 'APEX-03', x: 220, y: 80 },
          ]),
          fixtures.venueId,
        ],
      );

      // Attempt to publish
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/publish`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_draft_revision: 1,
            change_summary: 'Attempted to decommission APEX-01 with active booking',
          },
        },
      );

      expect(res.status).toBe(400);
      const err = app.errorOf(res);
      expect(err.code).toBe('LAYOUT_VALIDATION_FAILED');
      const details = (err as any).details || (res.json as any).errors || (res.json as any).details;
      expect(JSON.stringify(details)).toContain('DELETED_RESOURCE_HAS_FUTURE_BOOKINGS');

      // Restore pc1Id to draft
      await app.db.query(
        `UPDATE layout_drafts
         SET nodes = $1::jsonb
         WHERE venue_id = $2`,
        [
          JSON.stringify([
            { id: 'node-pc-1', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc1Id, label: 'APEX-01', x: 60, y: 80, w: 60, h: 40 },
            { id: 'node-pc-2', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc2Id, label: 'APEX-02', x: 140, y: 80, w: 60, h: 40 },
            { id: 'node-pc-3', kind: 'RESOURCE', layer_id: 'equipment', room_id: mainRoomId, resource_id: pc3Id, label: 'APEX-03', x: 220, y: 80, w: 60, h: 40 },
          ]),
          fixtures.venueId,
        ],
      );
    });
  });

  // ===========================================================================
  // 4. Customer Preview
  // ===========================================================================
  describe('Customer Layout Preview', () => {
    it('returns published customer layout preview with resolved pricing and occupancy status', async () => {
      // Query sample window covering the future booking: [now + 4h, now + 5h]
      const from = new Date(Date.now() + 4 * 3600 * 1000 + 10 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 4 * 3600 * 1000 + 40 * 60 * 1000).toISOString();

      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/preview?draft=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const prev = (res.json as any).preview;
      expect(prev.source).toBe('PUBLISHED');
      expect(prev.revision_number).toBe(1);
      expect(prev.summary.total_resources).toBe(3);
      expect(prev.summary.booked).toBe(1);
      expect(prev.summary.available).toBe(2);

      // Check node resource detail
      const p1Node = prev.nodes.find((n: any) => n.resource?.id === pc1Id);
      expect(p1Node).toBeDefined();
      expect(p1Node.resource.status).toBe('BOOKED');
      expect(p1Node.resource.hourly_rate_minor).toBe(3000);
      expect(p1Node.resource.currency).toBe('RON');

      const p2Node = prev.nodes.find((n: any) => n.resource?.id === pc2Id);
      expect(p2Node.resource.status).toBe('AVAILABLE');
    });

    it('can also preview the draft layout with real-time status', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/preview?draft=true`,
        {
          headers: { cookie: fixtures.manager.cookie },
        },
      );

      expect(res.status).toBe(200);
      const prev = (res.json as any).preview;
      expect(prev.source).toBe('DRAFT');
      expect(prev.summary.total_resources).toBe(3);
    });
  });

  // ===========================================================================
  // 5. Rollback Lifecycle
  // ===========================================================================
  describe('Rollback Lifecycle', () => {
    it('publishes revision 2, then rolls back to revision 1 creating immutable revision 3', async () => {
      // 1. Update draft with new metadata
      await app.db.query(
        `UPDATE layout_drafts
         SET metadata = '{"theme": "neon_blue_edition"}'::jsonb, revision = revision + 1
         WHERE venue_id = $1`,
        [fixtures.venueId],
      );

      // 2. Publish revision 2
      const pub2 = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/publish`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            expected_draft_revision: 2,
            change_summary: 'Theme visual update: neon blue edition',
          },
        },
      );
      expect(pub2.status).toBe(200);
      expect((pub2.json as any).revision.revision_number).toBe(2);

      // 3. Rollback to revision 1
      const rollRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/rollback`,
        {
          headers: { cookie: fixtures.owner.cookie, 'x-request-id': 'req-rollback-1' },
          body: {
            target_revision_number: 1,
            reason: 'Reverting theme update back to clean baseline',
          },
        },
      );

      expect(rollRes.status).toBe(200);
      const roll = (rollRes.json as any).revision;
      expect(roll.revision_number).toBe(3); // Linear progression: 1 -> 2 -> 3
      expect(roll.change_summary).toContain('Rollback to revision 1');
      expect(roll.is_active).toBe(true);

      // Verify DB pointer in venues table points to revision 3
      const venueCheck = await app.db.query<{ active_layout_revision_id: string }>(
        'SELECT active_layout_revision_id FROM venues WHERE id = $1',
        [fixtures.venueId],
      );
      expect(venueCheck.rows[0].active_layout_revision_id).toBe(roll.id);

      // Verify audit event
      const auditRes = await app.db.query<{ action: string; target_id: string }>(
        "SELECT action, target_id FROM audit_events WHERE venue_id = $1 AND action = 'LAYOUT_ROLLBACK_PUBLISHED' ORDER BY created_at DESC LIMIT 1",
        [fixtures.venueId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].target_id).toBe(roll.id);

      // Verify outbox event
      const outboxRes = await app.db.query<{ event_type: string }>(
        "SELECT event_type FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'LayoutRollbackPublished'",
        [roll.id],
      );
      expect(outboxRes.rowCount).toBe(1);
    });

    it('rejects rollback to non-existent revision number with 404 REVISION_NOT_FOUND', async () => {
      const res = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/rollback`,
        {
          headers: { cookie: fixtures.owner.cookie },
          body: {
            target_revision_number: 999,
            reason: 'Invalid target',
          },
        },
      );

      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('REVISION_NOT_FOUND');
    });
  });

  // ===========================================================================
  // 6. Revision History Listing
  // ===========================================================================
  describe('Revision History Listing', () => {
    it('lists all published revisions with active indicator', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/revisions`,
        {
          headers: { cookie: fixtures.reception.cookie },
        },
      );

      expect(res.status).toBe(200);
      const revs = (res.json as any).revisions;
      expect(revs.length).toBe(3); // Rev 3 (active), Rev 2, Rev 1

      expect(revs[0].revision_number).toBe(3);
      expect(revs[0].is_active).toBe(true);

      expect(revs[1].revision_number).toBe(2);
      expect(revs[1].is_active).toBe(false);

      expect(revs[2].revision_number).toBe(1);
      expect(revs[2].is_active).toBe(false);
    });
  });

  // ===========================================================================
  // 7. RBAC & Cross-Tenant Boundary
  // ===========================================================================
  describe('RBAC & Cross-Tenant Permissions', () => {
    it('prevents RECEPTION staff from publishing or rolling back layout (403 AUTH_ROLE_NOT_PERMITTED)', async () => {
      const pubRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/publish`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { expected_draft_revision: 3 },
        },
      );
      expect(pubRes.status).toBe(403);
      expect(app.errorOf(pubRes).code).toBe('AUTH_ROLE_NOT_PERMITTED');

      const rollRes = await app.call(
        'POST',
        `/v1/dashboard/venues/${fixtures.venueId}/layout/rollback`,
        {
          headers: { cookie: fixtures.reception.cookie },
          body: { target_revision_number: 1, reason: 'Unauthorized' },
        },
      );
      expect(rollRes.status).toBe(403);
      expect(app.errorOf(rollRes).code).toBe('AUTH_ROLE_NOT_PERMITTED');
    });

    it('enforces cross-tenant isolation returning 404 RESOURCE_NOT_FOUND on foreign venue layout access', async () => {
      const res = await app.call(
        'GET',
        `/v1/dashboard/venues/${foreignFixtures.venueId}/layout/revisions`,
        {
          headers: { cookie: fixtures.owner.cookie },
        },
      );
      expect(res.status).toBe(404);
      expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
