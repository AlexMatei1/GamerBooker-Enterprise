// ENG-001 / T-001, BR-011 (INTEGRITY): no overlapping ACTIVE allocations per resource.
// Level: integration DB against real PostgreSQL 17.
// Half-open tstzrange '[)' semantics: touching endpoints do not overlap.
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/gamerbooker_dev';
const EXCLUSION_VIOLATION = '23P01';
const D = '2026-11-06T';

const RESOURCE_A = '11111111-1111-4111-8111-111111111111';
const RESOURCE_B = '22222222-2222-4222-8222-222222222222';

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function expectCode(run: Promise<unknown>, expected: string): Promise<void> {
  try {
    await run;
  } catch (err) {
    if (errorCode(err) === expected) return;
    throw err;
  }
  throw new Error(`expected SQLSTATE ${expected}, but the statement succeeded`);
}

describe('ENG001-T01 / BR-011 exclusion constraint on active resource allocations', () => {
  const suffix = randomUUID().replace(/[^a-z0-9]/g, '').slice(0, 16);
  const table = `resource_allocation_test_${suffix}`;
  const constraint = `no_active_overlap_${suffix}`;
  const quotedTable = `"${table}"`;
  const quotedConstraint = `"${constraint}"`;

  let client: Client;
  let tableReady = false;

  const allocationRange = (from: string, to: string): string =>
    `tstzrange('${D}${from}:00Z'::timestamptz, '${D}${to}:00Z'::timestamptz, '[)')`;

  const insertSql = (from: string, to: string): string =>
    `INSERT INTO ${quotedTable} (id, resource_id, period, status) ` +
    `VALUES ($1::uuid, $2::uuid, ${allocationRange(from, to)}, $3)`;

  const insertAllocation = (
    resourceId: string,
    from: string,
    to: string,
    status: 'active' | 'cancelled',
    id: string = randomUUID(),
  ): Promise<unknown> => client.query(insertSql(from, to), [id, resourceId, status]);

  const countRows = async (): Promise<number> => {
    const result = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${quotedTable}`);
    return result.rows[0].n;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await client.query(
      `CREATE TABLE ${quotedTable} (` +
        ' id uuid PRIMARY KEY,' +
        ' resource_id uuid NOT NULL,' +
        ' period tstzrange NOT NULL,' +
        " status text NOT NULL CHECK (status IN ('active', 'cancelled'))," +
        ` CONSTRAINT ${quotedConstraint}` +
        " EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active')" +
        ')',
    );
    tableReady = true;
  });

  afterAll(async () => {
    try {
      if (tableReady) {
        await client.query(`DROP TABLE IF EXISTS ${quotedTable}`);
      }
    } finally {
      await client.end();
    }
  });

  beforeEach(async () => {
    await client.query(`TRUNCATE TABLE ${quotedTable}`);
  });

  it('A: constraint exists as a gist EXCLUDE restricted to active rows', async () => {
    // pg_constraint.conindid is the OID of the supporting INDEX RELATION, not a
    // pg_am OID. The access method must be reached through the index's relam.
    const result = await client.query<{ contype: string; amname: string; definition: string }>(
      `SELECT c.contype, a.amname, pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_class i ON i.oid = c.conindid
         JOIN pg_am a ON a.oid = i.relam
        WHERE n.nspname = current_schema()
          AND t.relname = $1
          AND c.conname = $2`,
      [table, constraint],
    );
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.contype).toBe('x');
    expect(row.amname).toBe('gist');
    expect(row.definition).toContain('EXCLUDE USING gist');
    expect(row.definition).toContain('status');
  });

  it('B: a second overlapping ACTIVE allocation on the same resource is rejected', async () => {
    await insertAllocation(RESOURCE_A, '10:00', '11:00', 'active');
    await expectCode(
      insertAllocation(RESOURCE_A, '10:30', '10:45', 'active'),
      EXCLUSION_VIOLATION,
    );
    expect(await countRows()).toBe(1);
  });

  it('C: adjacent half-open allocations [10,11) and [11,12) are both accepted', async () => {
    await insertAllocation(RESOURCE_A, '10:00', '11:00', 'active');
    await insertAllocation(RESOURCE_A, '11:00', '12:00', 'active');
    expect(await countRows()).toBe(2);
  });

  it('D: the same window on a different resource is accepted', async () => {
    await insertAllocation(RESOURCE_A, '10:00', '11:00', 'active');
    await insertAllocation(RESOURCE_B, '10:30', '11:30', 'active');
    expect(await countRows()).toBe(2);
  });

  it('E: a CANCELLED allocation may overlap an ACTIVE one on the same resource', async () => {
    await insertAllocation(RESOURCE_A, '10:00', '11:00', 'active');
    await insertAllocation(RESOURCE_A, '10:30', '10:45', 'cancelled');
    expect(await countRows()).toBe(2);
  });

  it('F: reactivating a CANCELLED allocation into an overlap is rejected', async () => {
    await insertAllocation(RESOURCE_A, '10:00', '11:00', 'active');
    const cancelledId = randomUUID();
    await insertAllocation(RESOURCE_A, '10:30', '10:45', 'cancelled', cancelledId);
    expect(await countRows()).toBe(2);

    await expectCode(
      client.query(`UPDATE ${quotedTable} SET status = 'active' WHERE id = $1::uuid`, [
        cancelledId,
      ]),
      EXCLUSION_VIOLATION,
    );

    const after = await client.query<{ status: string }>(
      `SELECT status FROM ${quotedTable} WHERE id = $1::uuid`,
      [cancelledId],
    );
    expect(after.rows[0].status).toBe('cancelled');
    expect(await countRows()).toBe(2);
  });

  it('G: concurrent overlapping ACTIVE inserts - exactly one wins', async () => {
    const second = new Client({ connectionString: DATABASE_URL });
    await second.connect();
    let firstInTransaction = false;
    try {
      await client.query('BEGIN');
      firstInTransaction = true;
      await client.query(insertSql('10:00', '11:00'), [
        randomUUID(),
        RESOURCE_A,
        'active',
      ]);

      await second.query('BEGIN');
      // Attach handlers immediately so the rejection is never unhandled.
      const settled = second
        .query(insertSql('10:30', '10:45'), [randomUUID(), RESOURCE_A, 'active'])
        .then(
          () => ({ ok: true as const, code: undefined }),
          (err: unknown) => ({ ok: false as const, code: errorCode(err) }),
        );

      // Releasing the first transaction resolves the blocked second insert.
      await client.query('COMMIT');
      firstInTransaction = false;

      const outcome = await settled;
      expect(outcome.ok).toBe(false);
      expect(outcome.code).toBe(EXCLUSION_VIOLATION);
      await second.query('ROLLBACK');

      expect(await countRows()).toBe(1);
    } finally {
      if (firstInTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      await second.end().catch(() => undefined);
    }
  });
});
