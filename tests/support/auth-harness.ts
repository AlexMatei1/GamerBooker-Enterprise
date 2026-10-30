/**
 * Shared harness for the ENG-002 acceptance suites.
 *
 * Each suite gets its own database (suffix supplied by the caller) because jest
 * runs suites in parallel workers: two suites sharing one database would drop
 * it under each other. Each worker is its own process, so the DATABASE_URL
 * override below is not visible to the other suites.
 *
 * Real HTTP through the Nest application and real PostgreSQL. Nothing on the
 * auth path is mocked.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

const ADMIN_DSN =
  process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/postgres';
const PG_HOST = '127.0.0.1:5433';
// Migrations run as the owner; the application runs as gamerbooker_app, which
// migrations/0002 gives SELECT and INSERT on audit_events only. Running the app
// as the owner would hide a least-privilege regression, so the tests do not.
const OWNER_DSN = process.env.MIGRATION_DATABASE_URL ?? ADMIN_DSN;
const APP_ROLE = 'gamerbooker_app';

export const PASSWORD = 'correct horse battery staple';

export interface ApiResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
  setCookie: string[];
}

export interface Envelope {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface CallOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TestApp {
  readonly baseUrl: string;
  readonly db: Client;
  /** A connection as the application role, for least-privilege probes. */
  readonly appDb: Client;
  call(method: string, path: string, opts?: CallOptions): Promise<ApiResponse>;
  errorOf(res: ApiResponse): Envelope;
  cookieOf(res: ApiResponse): string;
  uniqueEmail(): string;
  verifiedUser(): Promise<{ email: string; userId: string; cookie: string }>;
  stop(): Promise<void>;
}

async function adminExec(statement: string): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DSN });
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}

export function uniqueEmail(): string {
  return 'eng002-' + randomUUID().slice(0, 12) + '@example.test';
}

export async function startTestApp(dbSuffix: string): Promise<TestApp> {
  const testDb = 'gamerbooker_test_' + dbSuffix;
  const ownerDsn = OWNER_DSN.replace(/\/[^/]*$/, '/' + testDb);
  const appDsn = `postgresql://${APP_ROLE}@${PG_HOST}/${testDb}`;

  await adminExec(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
  await adminExec(`CREATE DATABASE ${testDb}`);

  // The application must never hold the owner DSN: migrations/0002 revokes
  // UPDATE and DELETE on audit_events from gamerbooker_app, and running the app
  // as the owner would quietly undo the least-privilege guarantee.
  process.env.MIGRATION_DATABASE_URL = ownerDsn;
  process.env.DATABASE_URL = appDsn;
  // DevAuthModule is imported only in development; the suites need the dev
  // delivery path to obtain a verification token (HANDOFF-ENG-002 D1).
  process.env.NODE_ENV = 'development';

  const migrationsDir = join(__dirname, '..', '..', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const db = new Client({ connectionString: ownerDsn });
  await db.connect();
  for (const file of files) {
    await db.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  const appDb = new Client({ connectionString: appDsn });
  await appDb.connect();

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/app.setup');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function call(
    method: string,
    path: string,
    opts: CallOptions = {},
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      redirect: 'manual',
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return {
      status: res.status,
      headers: res.headers,
      text,
      json,
      setCookie: res.headers.getSetCookie(),
    };
  }

  function errorOf(res: ApiResponse): Envelope {
    const body = res.json as { error?: Partial<Envelope> } | undefined;
    const error = body?.error;
    if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') {
      throw new Error('response is not a standard error envelope: ' + res.text.slice(0, 200));
    }
    return {
      code: error.code,
      message: error.message,
      request_id: String(error.request_id ?? ''),
      retryable: error.retryable === true,
      details: error.details,
    };
  }

  function cookieOf(res: ApiResponse): string {
    const first = res.setCookie[0];
    if (!first) {
      throw new Error('expected a Set-Cookie header, got none');
    }
    return first.split(';')[0];
  }

  /** Registers, verifies and logs in; returns the dashboard cookie and user id. */
  async function verifiedUser(): Promise<{ email: string; userId: string; cookie: string }> {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    expect(reg.status).toBe(201);
    const userId = (reg.json as { user_id: string }).user_id;
    const token = (reg.json as { verification_token?: string }).verification_token;
    expect(typeof token).toBe('string');
    const ver = await call('POST', '/v1/auth/verify', { body: { token } });
    expect(ver.status).toBe(200);
    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
    return { email, userId, cookie: cookieOf(login) };
  }

  async function stop(): Promise<void> {
    await app.close();
    const { closePool } = await import('../../src/db/pool');
    await closePool();
    await appDb.end();
    await db.end();
    await adminExec(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
  }

  return { baseUrl, db, appDb, call, errorOf, cookieOf, uniqueEmail, verifiedUser, stop };
}
