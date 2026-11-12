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
import type { LocalAdminPolicy } from '../../src/auth/local-admin-policy';

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
  /** Real provider lifecycle access, never an HTTP proof/reset endpoint. */
  readonly localAdminPolicy: LocalAdminPolicy;
  readonly databaseName: string;
  readonly baseUrl: string;
  readonly db: Client;
  /** A connection as the application role, for least-privilege probes. */
  readonly appDb: Client;
  call(method: string, path: string, opts?: CallOptions): Promise<ApiResponse>;
  errorOf(res: ApiResponse): Envelope;
  cookieOf(res: ApiResponse): string;
  uniqueEmail(): string;
  /**
   * Completes the TOTP second factor and returns the rotated session cookie.
   *
   * A fixture may not grant itself a privileged session by writing the factor
   * row: the guard needs `mfa_state = 'active'`, so the only honest path is the
   * one a person takes through the login form (ENG-002 T-04 / D10). Suites
   * that inserted a factor row and then reached for a gated handler were
   * asserting against a gate they had never opened.
   */
  elevateMfa(cookie: string, secret?: string): Promise<string>;
  verifiedUser(): Promise<{ email: string; userId: string; cookie: string }>;
  /**
   * Marks a hold's upfront amount as genuinely captured by the PSP.
   *
   * The confirm guard demands server-side proof of money, not a client claim:
   * for a hold with `due_now_minor > 0` it refuses with PAYMENT_REQUIRED unless
   * a CAPTURED intent exists for that hold with a matching amount. Suites that
   * exercise the *post-payment* lifecycle must therefore settle the hold, and
   * they must do it the way a webhook would — by writing the captured intent —
   * rather than by removing the guard.
   *
   * Returns the intent id to pass as `payment_intent_id`, or null when the hold
   * owes nothing upfront.
   */
  settleHoldPayment(holdId: string): Promise<string | null>;
  verifiedMobileUser(): Promise<{ email: string; userId: string; token: string }>;
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

export async function startTestApp(dbSuffix: string, options: {
  browserClient?: boolean;
  localAdmin?: { userId: string; enabled?: boolean; environment?: string; apiHost?: string; origins?: string };
  beforeInit?: (db: Client) => Promise<void>;
  listenHost?: '127.0.0.1' | '::1';
} = {}): Promise<TestApp> {
  if (!/^[a-z0-9_]{1,32}$/.test(dbSuffix)) throw new Error('Unsafe disposable database suffix.');
  // Never drop a fixed DB from an earlier run. Every invocation owns a fresh,
  // unique named scratch DB, including existing acceptance suites.
  const testDb = 'gamerbooker_test_' + dbSuffix + '_' + randomUUID().replace(/-/g,'').slice(0,12);
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
  // D5: the TOTP secret is encrypted with a key from the environment, and
  // MfaService refuses to start without one, so it is set before the module is
  // imported.
  process.env.MFA_SECRET_KEY = 'test-mfa-key-0123456789abcdef0123456789';
  process.env.LOCAL_ADMIN_PASSWORD_ONLY = options.localAdmin?.enabled === false || !options.localAdmin ? '0' : '1';
  process.env.LOCAL_COMPANY_APPROVAL_ONLY = '0';
  delete process.env.LOCAL_ADMIN_USER_ID;
  if (options.localAdmin) {
    process.env.LOCAL_ADMIN_USER_ID = options.localAdmin.userId;
    process.env.NODE_ENV = options.localAdmin.environment ?? 'development';
    process.env.API_HOST = options.localAdmin.apiHost ?? '127.0.0.1';
    process.env.DASHBOARD_ORIGINS = options.localAdmin.origins ?? 'https://127.0.0.1:5173';
  }

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
  if (options.beforeInit) await options.beforeInit(db);

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/app.setup');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();
  await app.listen(0, options.listenHost ?? '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://${options.listenHost === '::1' ? '[::1]' : '127.0.0.1'}:${address.port}`;
  const { LocalAdminPolicy } = await import('../../src/auth/local-admin-policy');

  async function call(
    method: string,
    path: string,
    opts: CallOptions = {},
  ): Promise<ApiResponse> {
    // Opt-in browser request contract for older suites. Security-negative suites
    // leave this OFF and send every intended header explicitly.
    const headers: Record<string, string> = { ...(options.browserClient ? {'x-gamerbooker-csrf':'1'} : {}), ...(opts.headers ?? {}) };
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body:
        opts.body === undefined
          ? undefined
          : typeof opts.body === 'string'
          ? opts.body
          : JSON.stringify(opts.body),
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

  /**
   * Completes the TOTP second factor with the fixture secret and returns the
   * rotated session cookie.
   *
   * `secret` is the base32 value the fixture stored in `user_mfa_factors`, not
   * the encrypted column. Callers that insert the factor through their own
   * SQL pass it explicitly; the default is the value every suite uses.
   */
  async function elevateMfa(
    cookie: string,
    secret = 'JBSWY3DPEHPK3PXP',
  ): Promise<string> {
    const { base32Decode, hotp, timeStepAt } = await import('../../src/auth/totp');
    const res = await call('POST', '/v1/auth/mfa/verify', {
      headers: { cookie, 'x-gamerbooker-csrf': '1' },
      body: { code: hotp(base32Decode(secret), timeStepAt(Date.now())) },
    });
    if (res.status !== 200) {
      throw new Error(
        'MFA elevation failed with ' + res.status + ': ' + res.text.slice(0, 200),
      );
    }
    return cookieOf(res);
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
    const login = await call('POST', '/v1/auth/login', { headers: {'x-gamerbooker-csrf':'1'}, body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
    return { email, userId, cookie: cookieOf(login) };
  }

  async function verifiedMobileUser(): Promise<{ email: string; userId: string; token: string }> {
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
    const login = await call('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD, kind: 'mobile' },
    });
    expect(login.status).toBe(200);
    const accessToken = (login.json as { token?: string }).token;
    expect(typeof accessToken).toBe('string');
    return { email, userId, token: accessToken! };
  }

  /**
   * Records a captured upfront payment for a hold, the way the PSP webhook
   * would, and returns the intent id to pass as payment_intent_id.
   *
   * The confirm guard demands server-side proof of money: a hold whose
   * due_now_minor is positive is refused with PAYMENT_REQUIRED until a
   * CAPTURED intent exists for it with a matching amount. Suites that
   * exercise the post-payment lifecycle must settle the hold through this
   * fixture rather than by dropping the guard. Null means the hold owes
   * nothing upfront.
   */
  async function settleHoldPayment(holdId: string): Promise<string | null> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO payment_intents
         (tenant_id, venue_id, provider, provider_ref, idempotency_key,
          amount_minor, currency, status, metadata)
       SELECT h.tenant_id, h.venue_id, 'sandbox',
              'sbx_pi_test_' || replace(gen_random_uuid()::text, '-', ''),
              'test-settle-' || h.id,
              q.due_now_minor, q.currency, 'CAPTURED',
              jsonb_build_object('type', 'SOLO_BOOKING_CHECKOUT', 'hold_id', h.id,
                                 'customer_id', h.customer_id)
         FROM holds h JOIN price_quotes q ON q.id = h.quote_id
        WHERE h.id = $1 AND q.due_now_minor > 0
        RETURNING id`,
      [holdId],
    );
    return res.rows[0]?.id ?? null;
  }
  async function stop(): Promise<void> {
    await app.close();
    const { closePool } = await import('../../src/db/pool');
    await closePool();
    await appDb.end();
    await db.end();
    await adminExec(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
  }

  return { databaseName:testDb, baseUrl, db, appDb, call, errorOf, cookieOf, uniqueEmail, elevateMfa, settleHoldPayment, verifiedUser, verifiedMobileUser, stop, localAdminPolicy: app.get(LocalAdminPolicy) };
}
