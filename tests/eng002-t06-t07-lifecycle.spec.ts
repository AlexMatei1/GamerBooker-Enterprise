/**
 * ENG-002 acceptance tests: T06 (logout-all) and T07 (delete own account),
 * plus the auth rate limiter.
 *
 * Level: integration. Real PostgreSQL and real HTTP through the shared
 * harness. No mocks.
 *
 * Source: handoff/HANDOFF-ENG-002.md, ENG002-T06 and ENG002-T07.
 */
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  PASSWORD,
  startTestApp,
  uniqueEmail,
  type ApiResponse,
  type Envelope,
  type TestApp,
} from './support/auth-harness';

let app: TestApp;
let db: Client;

const call = (
  method: string,
  path: string,
  opts?: Parameters<TestApp['call']>[2],
): Promise<ApiResponse> => app.call(method, path, opts);
const errorOf = (res: ApiResponse): Envelope => app.errorOf(res);
const verifiedUser = () => app.verifiedUser();

/** A second, mobile session for the same account, returned as a bearer token. */
async function mobileToken(email: string): Promise<string> {
  const login = await call('POST', '/v1/auth/login', {
    body: { email, password: PASSWORD, kind: 'mobile' },
  });
  expect(login.status).toBe(200);
  return (login.json as { token: string }).token;
}

beforeAll(async () => {
  app = await startTestApp('lifecycle');
  db = app.db;
}, 120000);

afterAll(async () => {
  if (app) {
    await app.stop();
  }
}, 120000);

describe('ENG002-T06 logout-all', () => {
  it('revokes every session, including the one that called it', async () => {
    const { email, cookie } = await verifiedUser();
    const bearer = await mobileToken(email);

    // Both sessions work before the call.
    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(200);
    expect((await call('GET', '/v1/me', { headers: { authorization: 'Bearer ' + bearer } })).status).toBe(200);

    const out = await call('POST', '/v1/auth/logout-all', { headers: { cookie } });
    expect(out.status).toBe(204);

    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(401);
    const withBearer = await call('GET', '/v1/me', {
      headers: { authorization: 'Bearer ' + bearer },
    });
    expect(withBearer.status).toBe(401);
    expect(errorOf(withBearer).code).toBe('AUTH_REQUIRED');
  });

  it('writes one audit row that reports how many sessions were revoked', async () => {
    const { userId, email, cookie } = await verifiedUser();
    await mobileToken(email);
    expect((await call('POST', '/v1/auth/logout-all', { headers: { cookie } })).status).toBe(204);

    const rows = await db.query<{ metadata: { revoked: number }; request_id: string | null }>(
      "SELECT metadata, request_id FROM audit_events WHERE actor_id = $1 AND action = 'auth.logout_all'",
      [userId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].metadata.revoked).toBeGreaterThanOrEqual(2);
    expect(rows.rows[0].request_id).toBeTruthy();
  });

  it('requires authentication', async () => {
    const res = await call('POST', '/v1/auth/logout-all');
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('AUTH_REQUIRED');
  });
});

describe('ENG002-T07 delete own account', () => {
  it('requires the password, and a wrong one changes nothing', async () => {
    const { email, cookie } = await verifiedUser();

    const wrong = await call('DELETE', '/v1/me', {
      body: { password: 'definitely-not-the-password' },
      headers: { cookie },
    });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('AUTH_INVALID_CREDENTIALS');

    // Still alive: the same cookie still authenticates and the credentials work.
    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(200);
    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
  });

  it('rejects a missing password and an unknown reason without deleting', async () => {
    const { email, cookie } = await verifiedUser();

    const noPassword = await call('DELETE', '/v1/me', { body: {}, headers: { cookie } });
    expect(noPassword.status).toBe(400);
    expect(errorOf(noPassword).code).toBe('VALIDATION_ERROR');

    const badReason = await call('DELETE', '/v1/me', {
      body: { password: PASSWORD, reason: 'because I said so' },
      headers: { cookie },
    });
    expect(badReason.status).toBe(400);
    expect(errorOf(badReason).code).toBe('VALIDATION_ERROR');

    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
  });

  it('revokes sessions, kills the credentials and anonymizes the row', async () => {
    const { email, userId, cookie } = await verifiedUser();
    const bearer = await mobileToken(email);
    const phone = '+4070' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
    await db.query('UPDATE users SET phone = $2 WHERE id = $1', [userId, phone]);

    const res = await call('DELETE', '/v1/me', {
      body: { password: PASSWORD, reason: 'privacy' },
      headers: { cookie },
    });
    expect(res.status).toBe(204);
    expect(res.setCookie.join(' ')).toMatch(/Max-Age=0/);

    // The cookie and the bearer token that existed before are both dead.
    expect((await call('GET', '/v1/me', { headers: { cookie } })).status).toBe(401);
    expect(
      (await call('GET', '/v1/me', { headers: { authorization: 'Bearer ' + bearer } })).status,
    ).toBe(401);

    // The old credentials no longer authenticate, and the address is gone.
    const login = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(401);
    expect(errorOf(login).code).toBe('AUTH_INVALID_CREDENTIALS');

    const row = await db.query<{
      email: string;
      phone: string | null;
      password_hash: string | null;
      deleted_at: Date | null;
      identity_status: string;
    }>(
      'SELECT email, phone, password_hash, deleted_at, identity_status FROM users WHERE id = $1',
      [userId],
    );
    const user = row.rows[0];
    expect(user.deleted_at).not.toBeNull();
    expect(user.identity_status).toBe('suspended');
    expect(user.phone).toBeNull();
    expect(user.password_hash).toBeNull();
    expect(user.email).not.toBe(email);
    expect(user.email).toMatch(/^deleted\+[0-9a-f-]{36}@deleted\.invalid$/);
    expect(user.email).not.toContain(email.split('@')[0]);
  });

  it('writes an audit row with action, actor, reason and request_id, and no PII', async () => {
    const { email, userId, cookie } = await verifiedUser();
    const res = await call('DELETE', '/v1/me', {
      body: { password: PASSWORD, reason: 'no_longer_needed' },
      headers: { cookie, 'x-request-id': 'delete-probe-1' },
    });
    expect(res.status).toBe(204);

    const rows = await db.query<{ metadata: { reason: string }; request_id: string }>(
      "SELECT metadata, request_id FROM audit_events WHERE actor_id = $1 AND action = 'account.delete'",
      [userId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].metadata.reason).toBe('no_longer_needed');
    expect(rows.rows[0].request_id).toBe('delete-probe-1');
    expect(JSON.stringify(rows.rows[0].metadata)).not.toContain(email);
  });

  it('frees the address for a new registration', async () => {
    const { email, cookie } = await verifiedUser();
    const del = await call('DELETE', '/v1/me', {
      body: { password: PASSWORD, reason: 'other' },
      headers: { cookie },
    });
    expect(del.status).toBe(204);

    const again = await call('POST', '/v1/auth/register', {
      body: { email, password: PASSWORD, accepted_terms: true },
    });
    expect(again.status).toBe(201);
    expect((again.json as { user_id: string }).user_id).toBeTruthy();
  });

  it('cannot be used to delete somebody else: only the session identity is read', async () => {
    const victim = await verifiedUser();
    const attacker = await verifiedUser();

    const res = await call('DELETE', '/v1/me', {
      body: { password: PASSWORD, reason: 'other', user_id: victim.userId },
      headers: { cookie: attacker.cookie },
    });
    expect(res.status).toBe(204);

    // The attacker's account is the one that died.
    expect((await call('GET', '/v1/me', { headers: { cookie: attacker.cookie } })).status).toBe(401);
    expect((await call('GET', '/v1/me', { headers: { cookie: victim.cookie } })).status).toBe(200);
  });
});

describe('auth rate limiting', () => {
  it('refuses the sixth failed login for one identity with a 429 envelope', async () => {
    const { email } = await verifiedUser();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await call('POST', '/v1/auth/login', {
        body: { email, password: 'wrong-password-attempt-' + attempt },
      });
      expect(res.status).toBe(401);
    }

    const limited = await call('POST', '/v1/auth/login', {
      body: { email, password: 'wrong-password-attempt-6' },
    });
    expect(limited.status).toBe(429);
    const error = errorOf(limited);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
    expect(error.request_id).toBeTruthy();
    expect(Number(error.details?.retry_after_seconds)).toBeGreaterThan(0);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('does not lock out a different identity on the same address', async () => {
    const exhausted = await verifiedUser();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await call('POST', '/v1/auth/login', {
        body: { email: exhausted.email, password: 'wrong-password-attempt-' + attempt },
      });
    }
    expect(
      (
        await call('POST', '/v1/auth/login', {
          body: { email: exhausted.email, password: 'one-more-wrong' },
        })
      ).status,
    ).toBe(429);

    const other = await verifiedUser();
    const res = await call('POST', '/v1/auth/login', {
      body: { email: other.email, password: 'wrong-but-first-for-this-identity' },
    });
    expect(res.status).toBe(401);
  });

  it('clears the failure count after a successful login', async () => {
    const { email } = await verifiedUser();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const res = await call('POST', '/v1/auth/login', {
        body: { email, password: 'typo-' + attempt },
      });
      expect(res.status).toBe(401);
    }
    const good = await call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
    expect(good.status).toBe(200);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const res = await call('POST', '/v1/auth/login', {
        body: { email, password: 'typo-after-success-' + attempt },
      });
      expect(res.status).toBe(401);
    }
  });

  it('counts the 429 against a known and an unknown identity the same way', async () => {
    const known = await verifiedUser();
    const unknown = uniqueEmail();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await call('POST', '/v1/auth/login', {
        body: { email: unknown, password: 'wrong-password-attempt-' + attempt },
      });
      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe('AUTH_INVALID_CREDENTIALS');
    }
    const unknownLimited = await call('POST', '/v1/auth/login', {
      body: { email: unknown, password: 'wrong-password-attempt-6' },
    });
    expect(unknownLimited.status).toBe(429);

    // The known identity is unaffected, and its own bucket behaves identically.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await call('POST', '/v1/auth/login', {
        body: { email: known.email, password: 'wrong-password-attempt-' + attempt },
      });
    }
    const knownLimited = await call('POST', '/v1/auth/login', {
      body: { email: known.email, password: 'wrong-password-attempt-6' },
    });
    expect(knownLimited.status).toBe(429);
    expect(errorOf(knownLimited).code).toBe(errorOf(unknownLimited).code);
    expect(errorOf(knownLimited).message).toBe(errorOf(unknownLimited).message);
  });

  it('never echoes the attempted password in a rate-limited response', async () => {
    const { email } = await verifiedUser();
    const marker = 'marker-' + randomUUID();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await call('POST', '/v1/auth/login', { body: { email, password: marker + attempt } });
    }
    const limited = await call('POST', '/v1/auth/login', { body: { email, password: marker + '6' } });
    expect(limited.status).toBe(429);
    expect(limited.text).not.toContain(marker);
  });
});
