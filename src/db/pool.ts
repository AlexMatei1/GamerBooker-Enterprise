import pg from 'pg';

const { Pool } = pg;

/**
 * One process-wide pg.Pool, created lazily on first getPool().
 *
 * DATABASE_URL comes from the environment only; no credentials are ever
 * written in source. A missing DSN is not fatal at import time (module load
 * happens during build, test discovery and boot), it is a clear error on first
 * use, which is the only moment a connection is actually being asked for.
 */
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) {
    return pool;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error('DATABASE_URL is not set; cannot open a database pool');
  }
  const max = process.env.PG_MAX_POOL ? Number(process.env.PG_MAX_POOL) : 30;
  pool = new Pool({ connectionString, max });
  return pool;
}

/** Drains every client and clears the singleton. Used by tests on teardown. */
export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) {
    await current.end();
  }
}
