/**
 * ENG-002 Slice A acceptance tests: T01, T02, T05, T06, T08.
 *
 * Level: integration. Real PostgreSQL (a dedicated database created, migrated
 * and dropped by this file) and real HTTP through the Nest application, using
 * the same configureApp() wiring as src/main.ts. No mocks of the auth path.
 *
 * T03, T04 and T07 belong to Slice B (RBAC guards, MFA, account deletion) and
 * are not claimed here.
 *
 * Source: handoff/HANDOFF-ENG-002.md, acceptance cases ENG002-T01..T08.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

const ADMIN_DSN =
  process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/postgres';
const TEST_DB = 'gamerbooker_test';
const TEST_DSN = `postgresql://postgres@127.0.0.1:5433/${TEST_DB}`;
const PASSWORD = 'correct horse battery staple';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ApiResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
  setCookie: string[];
}

interface Envelope {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
}

let app: INestApplication;
let baseUrl = '';
let db: Client;

async function adminExec(statement: string): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DSN });
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
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
  };
}

function cookieOf(res: ApiResponse): string {
  const first = res.setCookie[0];
  if (!first) {
    throw new Error('expected a Set-Cookie header, got none');
  }
  return first.split(';')[0];
}

function uniqueEmail(): string {
  return 'eng002-' + randomUUID().slice(0, 12) + '@example.test';
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

beforeAll(async () => {
  // A dedicated database so the tests never touch gamerbooker_dev and never
  // depend on rows another run left behind.
  await adminExec(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await adminExec(`CREATE DATABASE ${TEST_DB}`);

  process.env.DATABASE_URL = TEST_DSN;
  // DevAuthModule is imported only in development; T01 needs the dev delivery
  // path for the verification token (HANDOFF-ENG-002 D1).
  process.env.NODE_ENV = 'development';

  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  db = new Client({ connectionString: TEST_DSN });
  await db.connect();
  for (const file of files) {
    await db.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120000);

afterAll(async () => {
  if (app) {
    await app.close();
  }
  const { closePool } = await import('../src/db/pool');
  await closePool();
  if (db) {
    await db.end();
  }
  await adminExec(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
}, 120000);

describe('ENG002-T01 register, verify, login, own identity', () => {
  it('register returns 201 with a user_id and the dev-only verification token', async () => {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    expect(reg.status).toBe(201);
    const body = reg.json as { user_id: string; verification_token?: string };
    expect(UUID_V4.test(body.user_id)).toBe(true);
    expect(typeof body.verification_token).toBe('string');
  });

  it('login is refused until the email is verified', async () => {
    const email = uniqueEmail();
    await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(403);
    expect(errorOf(login).code).toBe('AUTH_EMAIL_UNVERIFIED');
  });

  it('verify then login then GET /v1/me returns the same user_id', async () => {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    const userId = (reg.json as { user_id: string }).user_id;
    const token = (reg.json as { verification_token: string }).verification_token;

    const ver = await call('POST', '/v1/auth/verify', { body: { token } });
    expect(ver.status).toBe(200);

    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);

    const me = await call('GET', '/v1/me', { headers: { cookie: cookieOf(login) } });
    expect(me.status).toBe(200);
    const body = me.json as { user_id: string; email: string };
    expect(body.user_id).toBe(userId);
    expect(body.email).toBe(email);
  });

  it('a verification token cannot be used twice', async () => {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    const token = (reg.json as { verification_token: string }).verification_token;
    expect((await call('POST', '/v1/auth/verify', { body: { token } })).status).toBe(200);
    const second = await call('POST', '/v1/auth/verify', { body: { token } });
    expect(second.status).toBe(404);
    expect(errorOf(second).code).toBe('AUTH_INVITATION_INVALID');
  });
});

describe('ENG002-T02 email uniqueness is enforced by the database', () => {
  it('a duplicate differing only in case is a conflict', async () => {
    const email = uniqueEmail();
    const first = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    expect(first.status).toBe(201);

    const duplicate = await call('POST', '/v1/auth/register', {
      body: { email: email.toUpperCase(), password: PASSWORD, accepted_terms: true },
    });
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate).code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('exactly one live row exists for that address', async () => {
    const email = uniqueEmail();
    await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    await call('POST', '/v1/auth/register', {
      body: { email: email.toUpperCase(), password: PASSWORD, accepted_terms: true },
    });
    const rows = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
      [email],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('a different address still succeeds', async () => {
    const reg = await call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: PASSWORD, accepted_terms: true },
    });
    expect(reg.status).toBe(201);
  });

  it('the unique index itself rejects a case variant, not only the service', async () => {
    const email = uniqueEmail();
    await db.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, 'x']);
    await expect(
      db.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
        email.toUpperCase(),
        'x',
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('ENG002-T05 no account enumeration', () => {
  it('unknown email and wrong password are indistinguishable', async () => {
    const { email } = await verifiedUser();
    const wrongPassword = await call('POST', '/v1/auth/login', {
      body: { email, password: 'definitely-not-the-password' },
    });
    const unknownEmail = await call('POST', '/v1/auth/login', {
      body: { email: uniqueEmail(), password: 'definitely-not-the-password' },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const a = errorOf(wrongPassword);
    const b = errorOf(unknownEmail);
    expect(a.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(b.code).toBe(a.code);
    expect(b.message).toBe(a.message);
  });

  it('AUTH_EMAIL_UNVERIFIED is only reachable with a correct password', async () => {
    const email = uniqueEmail();
    await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    const wrong = await call('POST', '/v1/auth/login', {
      body: { email, password: 'wrong-password-here' },
    });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('an unknown email never leaks a verification side effect', async () => {
    const res = await call('POST', '/v1/auth/login', {
      body: { email: uniqueEmail(), password: PASSWORD },
    });
    expect(res.status).toBe(401);
    expect(res.text).not.toMatch(/verif/i);
  });
});

describe('ENG002-T06 session lifecycle', () => {
  it('the dashboard cookie is __Host- prefixed and holds a 32-byte token', async () => {
    const { cookie } = await verifiedUser();
    expect(cookie.startsWith('__Host-gb_session=')).toBe(true);
    // 32 random bytes as base64url: 43 characters, and nothing else.
    const value = cookie.slice('__Host-gb_session='.length);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('Set-Cookie has HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain', async () => {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    await call('POST', '/v1/auth/verify', {
      body: { token: (reg.json as { verification_token: string }).verification_token },
    });
    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    const raw = login.setCookie.join(' | ');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//i);
    expect(raw).not.toMatch(/Domain=/i);
  });

  it('logout revokes the session in the database and the cookie stops working', async () => {
    const { cookie } = await verifiedUser();
    const before = await call('GET', '/v1/me', { headers: { cookie } });
    expect(before.status).toBe(200);

    const out = await call('POST', '/v1/auth/logout', { headers: { cookie } });
    expect(out.status).toBe(204);

    const after = await call('GET', '/v1/me', { headers: { cookie } });
    expect(after.status).toBe(401);
    expect(errorOf(after).code).toBe('AUTH_REQUIRED');

    const revoked = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NOT NULL',
    );
    expect(revoked.rows[0].n).toBeGreaterThan(0);
  });

  it('every login mints a different token (no fixation, no reuse)', async () => {
    const { email } = await verifiedUser();
    const first = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    const second = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(cookieOf(first)).not.toBe(cookieOf(second));
  });

  it('a revoked token cannot be replayed even if the client keeps it', async () => {
    const { cookie } = await verifiedUser();
    await call('POST', '/v1/auth/logout', { headers: { cookie } });
    await call('POST', '/v1/auth/logout', { headers: { cookie } });
    const replay = await call('GET', '/v1/me', { headers: { cookie } });
    expect(replay.status).toBe(401);
  });

  it('a mobile bearer token authenticates the same way as the cookie', async () => {
    const { email } = await verifiedUser();
    const login = await call('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD, kind: 'mobile' },
    });
    expect(login.status).toBe(200);
    expect(login.setCookie).toHaveLength(0);
    const token = (login.json as { token: string }).token;
    expect(typeof token).toBe('string');

    const me = await call('GET', '/v1/me', { headers: { authorization: 'Bearer ' + token } });
    expect(me.status).toBe(200);
  });

  it('a malformed bearer token is rejected without a database error', async () => {
    const me = await call('GET', '/v1/me', { headers: { authorization: 'Bearer not-a-token' } });
    expect(me.status).toBe(401);
    expect(errorOf(me).code).toBe('AUTH_REQUIRED');
  });
});

describe('ENG002-T08 mass assignment and secret leakage', () => {
  it('user_id and role in the login body are ignored', async () => {
    const { email, userId } = await verifiedUser();
    const login = await call('POST', '/v1/auth/login', {
      body: {
        email,
        password: PASSWORD,
        user_id: '00000000-0000-4000-8000-000000000000',
        role: 'PLATFORM_ADMIN',
      },
    });
    expect(login.status).toBe(200);
    expect((login.json as { user_id: string }).user_id).toBe(userId);

    const me = await call('GET', '/v1/me', { headers: { cookie: cookieOf(login) } });
    expect(me.status).toBe(200);
    expect(me.text).not.toMatch(/PLATFORM_ADMIN/);
    expect((me.json as { user_id: string }).user_id).toBe(userId);
  });

  it('/v1/me never returns a hash, a token or an MFA secret', async () => {
    const { cookie } = await verifiedUser();
    const me = await call('GET', '/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(me.text).not.toMatch(/password|argon2|\$argon2/i);
    expect(me.text).not.toMatch(/token|secret|recovery/i);
  });

  it('a failed login never echoes the submitted password', async () => {
    const { email } = await verifiedUser();
    const secret = 'unique-marker-' + randomUUID();
    const res = await call('POST', '/v1/auth/login', { body: { email, password: secret } });
    expect(res.status).toBe(401);
    expect(res.text).not.toContain(secret);
  });

  it('every auth mutation writes an append-only audit row with a request_id', async () => {
    const { userId } = await verifiedUser();
    const rows = await db.query<{ action: string; request_id: string | null }>(
      'SELECT action, request_id FROM audit_events WHERE actor_user_id = $1 ORDER BY occurred_at',
      [userId],
    );
    const actions = rows.rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.register', 'auth.verify_email', 'auth.login']));
    for (const row of rows.rows) {
      expect(row.request_id).toBeTruthy();
    }
  });

  it('audit_events rejects UPDATE and DELETE at the database level', async () => {
    await expect(db.query("UPDATE audit_events SET action = 'tampered'")).rejects.toMatchObject({
      code: '23001',
    });
    await expect(db.query('DELETE FROM audit_events')).rejects.toMatchObject({ code: '23001' });
  });

  it('audit metadata carries no email, phone or token', async () => {
    await verifiedUser();
    const leaks = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_events WHERE metadata::text ~* '@example|password|token'",
    );
    expect(leaks.rows[0].n).toBe(0);
  });
});

describe('ENG-002 error envelope and routing', () => {
  it('an unauthenticated /v1/me returns the envelope with a request_id', async () => {
    const res = await call('GET', '/v1/me');
    expect(res.status).toBe(401);
    const error = errorOf(res);
    expect(error.request_id.length).toBeGreaterThan(0);
    expect(error.retryable).toBe(false);
  });

  it('the error request_id matches the echoed X-Request-Id', async () => {
    const res = await call('GET', '/v1/me', { headers: { 'x-request-id': 'eng002-probe-1' } });
    expect(res.headers.get('x-request-id')).toBe('eng002-probe-1');
    expect(errorOf(res).request_id).toBe('eng002-probe-1');
  });

  it('an unknown /v1 route still uses the envelope', async () => {
    const res = await call('GET', '/v1/no-such-route');
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('health probes stay unversioned and /v1/healthz does not exist', async () => {
    expect((await call('GET', '/healthz')).status).toBe(200);
    expect((await call('GET', '/v1/healthz')).status).toBe(404);
  });

  it('validation failures name the field and never the value', async () => {
    // A rejected value carrying a unique marker, so "the value is not echoed"
    // is a real assertion and not a vacuous one.
    const marker = 'marker-' + randomUUID();
    const rejected = marker + 'x'.repeat(200);
    const res = await call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: rejected, accepted_terms: true },
    });
    expect(res.status).toBe(400);
    const error = errorOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(res.text).not.toContain(marker);
    expect(res.text).toMatch(/password/);
    expect(res.text).toMatch(/too_long/);
  });
});
