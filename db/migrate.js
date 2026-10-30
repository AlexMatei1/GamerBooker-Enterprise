#!/usr/bin/env node
'use strict';

// ENG-002 migration runner.
// CommonJS, no dependencies beyond pg.
//
// MIGRATION_DATABASE_URL is the owner DSN and is what this runner uses; it falls
// back to DATABASE_URL when unset, which is only safe when both are the same
// role. The application must NOT use the owner DSN: migrations/0002 revokes
// UPDATE and DELETE on audit_events from the application role, and running the
// app as the owner would silently undo that.
//
// Every migrations/*.sql is applied in filename order, one file per
// transaction, recorded in schema_migrations, and skipped if already recorded.
// A second run applies nothing. One line is printed per file. On failure the
// file is rolled back and not recorded, and the process exits non-zero.
//
// The session advisory lock is taken before anything else is created, so two
// concurrent first runs cannot race the schema_migrations DDL.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

// Stable key for pg_advisory_lock(bigint). Plain decimal digits only: the value
// is cast to bigint in SQL, so a hex literal would throw.
const LOCK_KEY = '305419897';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// A file that opens or closes its own transaction would end the transaction the
// runner wraps around it: a later failure could then no longer roll back the
// earlier statements, and the schema_migrations row would commit separately.
//
// The check runs on the file with dollar-quoted bodies, comments and string
// literals removed. A DO $$ ... BEGIN ... END; $$ block is PL/pgSQL, not
// transaction control, and must not be flagged.
const TRANSACTION_CONTROL = /(^|;)\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END)\s*;/i;

function hasTransactionControl(sql) {
  const stripped = sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
  return TRANSACTION_CONTROL.test(stripped);
}

async function listMigrations() {
  const entries = await fsp.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function main() {
  const filenames = await listMigrations();

  const client = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || undefined,
  });
  await client.connect();
  let failed = false;

  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
        ' filename text PRIMARY KEY,' +
        ' applied_at timestamptz NOT NULL DEFAULT now()' +
        ')',
    );

    const applied = await client.query('SELECT filename FROM schema_migrations');
    const done = new Set(applied.rows.map((row) => row.filename));

    for (const filename of filenames) {
      if (done.has(filename)) {
        console.log('skip  ' + filename + ' (already applied)');
        continue;
      }
      const sql = await fsp.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      if (hasTransactionControl(sql)) {
        failed = true;
        console.error(
          'FAIL  ' + filename + ': contains its own transaction control; the runner owns BEGIN/COMMIT',
        );
        break;
      }
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

if (require.main === module) {
  main().catch((err) => {
    const message = err && err.message ? err.message : String(err);
    console.error('migrate: ' + message);
    process.exitCode = 1;
  });
}

module.exports = { hasTransactionControl, LOCK_KEY };
