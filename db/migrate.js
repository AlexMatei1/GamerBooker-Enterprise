#!/usr/bin/env node
'use strict';

// ENG-002 Slice A migration runner.
// CommonJS, no dependencies beyond pg.
//
// DATABASE_URL is read from process.env. When unset, pg's defaults apply.
// The runner does not hardcode a DSN. The primary agent invokes it with
// DATABASE_URL=postgresql://postgres@127.0.0.1:5433/gamerbooker_dev.
//
// Every migrations/*.sql is applied in filename order, one file per
// transaction, recorded in schema_migrations, and skipped if already recorded.
// A second run applies nothing. One line is printed per file. On failure the
// file is rolled back and not recorded, and the process exits non-zero.
//
// A session advisory lock covers the run so two runners cannot collide.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

// Stable key for pg_advisory_lock(bigint). Plain decimal digits only: the value
// is cast to bigint in SQL, so a hex literal would throw.
const LOCK_KEY = '305419897';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function listMigrations() {
  const entries = await fsp.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function main() {
  const filenames = await listMigrations();

  const client = new Client({ connectionString: process.env.DATABASE_URL || undefined });
  await client.connect();
  let failed = false;

  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
        ' filename text PRIMARY KEY,' +
        ' applied_at timestamptz NOT NULL DEFAULT now()' +
        ')',
    );
    await client.query('SELECT pg_advisory_lock($1::bigint)', [LOCK_KEY]);

    const applied = await client.query('SELECT filename FROM schema_migrations');
    const done = new Set(applied.rows.map((row) => row.filename));

    for (const filename of filenames) {
      if (done.has(filename)) {
        console.log('skip  ' + filename + ' (already applied)');
        continue;
      }
      const sql = await fsp.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log('apply ' + filename);
        done.add(filename);
      } catch (err) {
        failed = true;
        await client.query('ROLLBACK').catch(() => undefined);
        const message = err && err.message ? err.message : String(err);
        console.error('FAIL  ' + filename + ': ' + message);
        break;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [LOCK_KEY]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error('migrate: ' + message);
  process.exitCode = 1;
});
