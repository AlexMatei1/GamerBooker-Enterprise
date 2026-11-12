/**
 * ENG-002 Slice A hardening: the guarantees added in response to the review.
 *
 * Each case below corresponds to a finding that was raised against 3f126b4 and
 * fixed before Slice A could be called acceptable:
 *   - the application role must not be able to rewrite audit history
 *   - idle expiry must actually slide, bounded by the absolute expiry
 *   - a dashboard token must not be usable as a bearer token
 *   - a token-bearing response must not be cacheable
 *   - the dev re-issue route must supersede the previous token and leave a trail
 *   - audit rows must always carry a request id
 *   - the migration runner must reject a file that owns its transaction
 *
 * Level: integration, real PostgreSQL and real HTTP through the shared harness.
 */
import type { Client } from 'pg';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PASSWORD,
  startTestApp,
  uniqueEmail,
  type ApiResponse,
  type Envelope,
  type TestApp,
} from './support/auth-harness';

const requireFromHere = createRequire(__filename);
const { hasTransactionControl } = requireFromHere('../db/migrate.js') as {
  hasTransactionControl: (sql: string) => boolean;
};

const SESSION_COOKIE = '__Host-gb_session';
const IDLE_MAX_AGE = 'Max-Age=43200';

let app: TestApp;
let db: Client;

const call = (
  method: string,
  path: string,
  opts?: Parameters<TestApp['call']>[2],
): Promise<ApiResponse> => app.call(method, path, opts);
const errorOf = (res: ApiResponse): Envelope => app.errorOf(res);
const verifiedUser = () => app.verifiedUser();

interface SessionRow {
  id: string;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

async function sessionOf(userId: string): Promise<SessionRow> {
  const rows = await db.query<SessionRow>(
    'SELECT id, idle_expires_at, absolute_expires_at FROM sessions' +
      ' WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  const row = rows.rows[0];
  if (!row) {
    throw new Error('expected a live session for user ' + userId);
  }
  return row;
}

beforeAll(async () => {
  app = await startTestApp('hardening', { browserClient: true });
  db = app.db;
}, 120000);

afterAll(async () => {
  if (app) {
    await app.stop();
  }
}, 120000);

describe('least privilege: the application role cannot rewrite audit history', () => {
  it('cannot UPDATE or DELETE audit_events (SQLSTATE 42501)', async () => {
    await expect(appDbUpdate("UPDATE audit_events SET action = 'tampered'")).rejects.toMatchObject({
      code: '42501',
    });
    await expect(appDbUpdate('DELETE FROM audit_events')).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot disable the append-only trigger, because it does not own the table', async () => {
    await expect(
      appDbUpdate('ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('can still SELECT and INSERT, so the application keeps working', async () => {
    const privilege = await app.appDb.query<{ can_select: boolean; can_insert: boolean }>(
      "SELECT has_table_privilege(current_user, 'audit_events', 'SELECT') AS can_select," +
        " has_table_privilege(current_user, 'audit_events', 'INSERT') AS can_insert",
    );
    expect(privilege.rows[0].can_select).toBe(true);
    expect(privilege.rows[0].can_insert).toBe(true);

    await expect(
      app.appDb.query(
        "INSERT INTO audit_events (action, metadata, request_id)" +
          " VALUES ('test.privilege', '{}'::jsonb, 'test-privilege-1')",
      ),
    ).resolves.toBeDefined();
  });

  it('is not the table owner', async () => {
    const owner = await db.query<{ owner: string }>(
      "SELECT tableowner AS owner FROM pg_tables WHERE tablename = 'audit_events'",
    );
    const appUser = await app.appDb.query<{ current_user: string }>('SELECT current_user');
    expect(appUser.rows[0].current_user).toBe('gamerbooker_app');
    expect(owner.rows[0].owner).not.toBe(appUser.rows[0].current_user);
  });
});

describe('audit_events.request_id is mandatory', () => {
  it('is NOT NULL in the schema and no stored row violates it', async () => {
    const column = await db.query<{ is_nullable: string }>(
      'SELECT is_nullable FROM information_schema.columns' +
        " WHERE table_name = 'audit_events' AND column_name = 'request_id'",
    );
    expect(column.rows[0].is_nullable).toBe('NO');

    const nulls = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM audit_events WHERE request_id IS NULL',
    );
    expect(nulls.rows[0].n).toBe(0);
  });

  it('rejects an INSERT without a request id (23502)', async () => {
    await expect(
      app.appDb.query("INSERT INTO audit_events (action, metadata) VALUES ('test.null', '{}'::jsonb)"),
    ).rejects.toMatchObject({ code: '23502' });
  });
});

describe('idle expiry slides and is bounded by the absolute expiry', () => {
  it('moves idle_expires_at forward on an accepted request and refreshes the cookie', async () => {
    const { userId, cookie } = await verifiedUser();
    const session = await sessionOf(userId);

    // Push the idle deadline to one minute from now, still valid.
    await db.query("UPDATE sessions SET idle_expires_at = now() + interval '1 minute' WHERE id = $1", [
      session.id,
    ]);

    const res = await call('GET', '/v1/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.setCookie.join(';')).toContain(IDLE_MAX_AGE);

    const after = await sessionOf(userId);
    expect(after.idle_expires_at.getTime()).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);
    expect(after.idle_expires_at.getTime()).toBeLessThanOrEqual(after.absolute_expires_at.getTime());
  });

  it('never extends idle past absolute_expires_at', async () => {
    const { userId, cookie } = await verifiedUser();
    const session = await sessionOf(userId);

    await db.query(
      "UPDATE sessions SET idle_expires_at = now() + interval '1 minute'," +
        " absolute_expires_at = now() + interval '5 minutes' WHERE id = $1",
      [session.id],
    );

    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(200);

    const after = await sessionOf(userId);
    const gapMs = after.absolute_expires_at.getTime() - after.idle_expires_at.getTime();
    expect(Math.abs(gapMs)).toBeLessThan(1000);
  });

  it('refuses the session once the absolute expiry has passed, even if idle would allow it', async () => {
    const { userId, cookie } = await verifiedUser();
    const session = await sessionOf(userId);

    await db.query(
      "UPDATE sessions SET idle_expires_at = now() + interval '1 hour'," +
        " absolute_expires_at = now() - interval '1 second' WHERE id = $1",
      [session.id],
    );

    const res = await call('GET', '/v1/me', { headers: { cookie } });
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('AUTH_REQUIRED');
  });
});

describe('a session token is bound to the channel it was issued for', () => {
  it('rejects a dashboard token presented as a bearer token', async () => {
    const { cookie } = await verifiedUser();
    const token = cookie.slice(SESSION_COOKIE.length + 1);

    const asBearer = await call('GET', '/v1/me', {
      headers: { authorization: 'Bearer ' + token },
    });
    expect(asBearer.status).toBe(401);
    expect(errorOf(asBearer).code).toBe('AUTH_REQUIRED');

    // The same token still works in the shape it was issued for.
    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(200);
  });

  it('accepts a mobile token as a bearer token', async () => {
    const { email } = await verifiedUser();
    const login = await call('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD, kind: 'mobile' },
    });
    expect(login.status).toBe(200);
    const token = (login.json as { token: string }).token;

    expect(
      (await call('GET', '/v1/me', { headers: { authorization: 'Bearer ' + token } })).status,
    ).toBe(200);
  });
});

describe('token-bearing responses are not cacheable', () => {
  it('sets Cache-Control: no-store on login and on /v1/me', async () => {
    const { email, cookie } = await verifiedUser();

    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
    expect(login.headers.get('cache-control')).toBe('no-store');

    const me = await call('GET', '/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(me.headers.get('cache-control')).toBe('no-store');
  });
});

describe('dev verification re-issue supersedes and is audited (D1)', () => {
  it('invalidates the previous token, leaves one live token, and writes an audit row', async () => {
    const email = uniqueEmail();
    const reg = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    expect(reg.status).toBe(201);
    const userId = (reg.json as { user_id: string }).user_id;
    const first = (reg.json as { verification_token: string }).verification_token;

    const reissue = await call(
      'GET',
      '/v1/dev/verification-token?email=' + encodeURIComponent(email),
      { headers: { 'x-request-id': 'dev-reissue-probe' } },
    );
    expect(reissue.status).toBe(200);
    const second = (reissue.json as { token: string }).token;
    expect(second).not.toBe(first);

    const live = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM verification_tokens' +
        " WHERE user_id = $1 AND purpose = 'email_verify' AND consumed_at IS NULL",
      [userId],
    );
    expect(live.rows[0].n).toBe(1);

    const oldUse = await call('POST', '/v1/auth/verify', { body: { token: first } });
    expect(oldUse.status).toBe(404);
    expect(errorOf(oldUse).code).toBe('AUTH_INVITATION_INVALID');

    const newUse = await call('POST', '/v1/auth/verify', { body: { token: second } });
    expect(newUse.status).toBe(200);

    const audit = await db.query<{ request_id: string }>(
      "SELECT request_id FROM audit_events WHERE actor_id = $1 AND action = 'auth.dev_verification_reissued'",
      [userId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].request_id).toBe('dev-reissue-probe');
  });
});

describe('the migration runner rejects a file that owns its transaction', () => {
  it('flags top-level BEGIN and COMMIT', () => {
    expect(hasTransactionControl('BEGIN;\nSELECT 1;\nCOMMIT;')).toBe(true);
    expect(hasTransactionControl('SELECT 1;\nROLLBACK;')).toBe(true);
  });

  it('does not flag a PL/pgSQL block, a comment or a string literal', () => {
    expect(hasTransactionControl('DO $$\nBEGIN\n  NULL;\nEND\n$$;')).toBe(false);
    expect(hasTransactionControl('DO $$\nBEGIN\n  BEGIN\n    NULL;\n  END;\nEND\n$$;')).toBe(false);
    expect(hasTransactionControl('-- BEGIN;\nSELECT 1;')).toBe(false);
    expect(hasTransactionControl("SELECT 'COMMIT;';")).toBe(false);
  });

  it('accepts the migrations that are actually in the repository', () => {
    const dir = join(__dirname, '..', 'migrations');
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(hasTransactionControl(readFileSync(join(dir, file), 'utf8'))).toBe(false);
    }
  });
});

async function appDbUpdate(sql: string): Promise<unknown> {
  return app.appDb.query(sql);
}
