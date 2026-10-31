import { Client } from 'pg';

/**
 * ENG-004: Verify exclusion constraint on resource_claims prevents overlapping ACTIVE_HOLD/CONFIRMED claims.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/gamerbooker_dev';

describe('ENG-004 Exclusion Constraints', () => {
  let client: Client;
  const resourceId = '77777777-7777-7777-7777-777777777777'; // PC #1 from fixture seeds
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const holderId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    // Ensure clean state for resource_claims for this resource
    await client.query('DELETE FROM resource_claims WHERE resource_id = $1', [resourceId]);
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => undefined);
    }
  });

  test('allows non-overlapping claims', async () => {
    // First claim: 2026-11-01 10:00-11:00 UTC
    const claim1 = await client.query(
      `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
       VALUES ($1, $2, $3, 'HOLD', 'ACTIVE_HOLD', tstzrange('2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z'))
       RETURNING id`,
      [resourceId, tenantId, holderId],
    );
    expect(claim1.rowCount).toBe(1);

    // Second claim: non-overlapping 12:00-13:00 UTC
    const claim2 = await client.query(
      `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
       VALUES ($1, $2, $3, 'HOLD', 'ACTIVE_HOLD', tstzrange('2026-11-01T12:00:00Z', '2026-11-01T13:00:00Z'))
       RETURNING id`,
      [resourceId, tenantId, holderId],
    );
    expect(claim2.rowCount).toBe(1);
  });

  test('rejects overlapping ACTIVE_HOLD claim', async () => {
    // Overlapping 10:30-11:30 should fail with exclusion violation
    await expect(
      client.query(
        `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
         VALUES ($1, $2, $3, 'HOLD', 'ACTIVE_HOLD', tstzrange('2026-11-01T10:30:00Z', '2026-11-01T11:30:00Z'))`,
        [resourceId, tenantId, holderId],
      ),
    ).rejects.toThrow();
  });

  test('allows overlapping CANCELLED claim', async () => {
    // Overlap but state = CANCELLED should bypass exclusion
    const claim = await client.query(
      `INSERT INTO resource_claims (resource_id, tenant_id, holder_id, claim_type, state, slot)
       VALUES ($1, $2, $3, 'HOLD', 'CANCELLED', tstzrange('2026-11-01T10:30:00Z', '2026-11-01T11:30:00Z'))
       RETURNING id`,
      [resourceId, tenantId, holderId],
    );
    expect(claim.rowCount).toBe(1);
  });
});
