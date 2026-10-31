/**
 * ENG002-T04: the second factor.
 *
 * A gated role (OWNER / VENUE_MANAGER / PLATFORM_ADMIN, D2) must prove a TOTP
 * code before the session becomes usable; repeated wrong codes lock the factor
 * (D11); a code cannot be replayed (D12); and nothing secret ever comes back out
 * of GET /v1/me.
 *
 * Real HTTP and real PostgreSQL through the shared harness: no mocks, and the
 * application connects as gamerbooker_app, so the schema privileges are the ones
 * production uses.
 */
import { base32Decode, hotp, timeStepAt } from '../src/auth/totp';
import {
  PASSWORD,
  startTestApp,
  type ApiResponse,
  type TestApp,
} from './support/auth-harness';

/** The code an authenticator app would show for this secret right now. */
function codeFor(secret: string): string {
  return hotp(base32Decode(secret), timeStepAt(Date.now()));
}

async function grantRole(app: TestApp, userId: string, role: string): Promise<void> {
  const tenant = await app.db.query<{ id: string }>(
    "INSERT INTO tenants (legal_name) VALUES ('MFA test tenant') RETURNING id",
  );
  const tenantId = tenant.rows[0].id;
  const venue = await app.db.query<{ id: string }>(
    "INSERT INTO venues (tenant_id, timezone) VALUES ($1, 'Europe/Bucharest') RETURNING id",
    [tenantId],
  );
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role)' +
      ' VALUES ($1, $2, $3, $4)',
    [userId, venue.rows[0].id, tenantId, role],
  );
}

function body(res: ApiResponse): Record<string, unknown> {
  return (res.json ?? {}) as Record<string, unknown>;
}

describe('ENG002-T04 second factor lifecycle', () => {
  let app: TestApp;
  let email: string;
  let userId: string;
  let pendingCookie: string;
  let secret: string;
  let recoveryCodes: string[];
  let activeCookie: string;
  let acceptedCode: string;

  beforeAll(async () => {
    app = await startTestApp('t04mfa');
    const user = await app.verifiedUser();
    email = user.email;
    userId = user.userId;
    await grantRole(app, userId, 'OWNER');

    const login = await app.call('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD },
    });
    expect(login.status).toBe(200);
    pendingCookie = app.cookieOf(login);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  }, 60000);

  it('stops a gated login at the second factor without claiming a role', () => {
    // The login already happened in beforeAll; repeat it to assert the body.
    return app
      .call('POST', '/v1/auth/login', { body: { email, password: PASSWORD } })
      .then((res) => {
        expect(res.status).toBe(200);
        const json = body(res);
        expect(json.mfa_required).toBe(true);
        expect(json.mfa_enrollment_required).toBe(true);
        // A dashboard login never returns the token in the body.
        expect(json.token).toBeUndefined();
        // No role, tenant or venue claim is ever in the login body.
        expect(JSON.stringify(json)).not.toMatch(/OWNER|role|tenant|venue/i);
      });
  });

  it('refuses every non-MFA route to a pending session', async () => {
    const me = await app.call('GET', '/v1/me', { headers: { cookie: pendingCookie } });
    expect(me.status).toBe(403);
    expect(app.errorOf(me).code).toBe('AUTH_MFA_REQUIRED');

    const venues = await app.call('GET', '/v1/venues/' + '00000000-0000-4000-8000-000000000000', {
      headers: { cookie: pendingCookie },
    });
    expect(venues.status).toBe(403);
    expect(app.errorOf(venues).code).toBe('AUTH_MFA_REQUIRED');
  });

  it('returns the secret and recovery codes exactly once, encrypted at rest', async () => {
    const res = await app.call('POST', '/v1/auth/mfa/enroll', {
      headers: { cookie: pendingCookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const json = body(res);
    secret = String(json.secret);
    recoveryCodes = json.recovery_codes as string[];
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(recoveryCodes).toHaveLength(10);
    expect(String(json.otpauth_uri)).toMatch(/^otpauth:\/\/totp\//);
    expect(String(json.otpauth_uri)).toContain('secret=' + secret);

    // The database must not hold the secret in any recoverable-by-reading form:
    // the column is pgcrypto output, and decrypting it needs the env key.
    const stored = await app.db.query<{
      secret_encrypted: Buffer;
      recovery_codes_hash: string[];
      confirmed_at: Date | null;
    }>(
      'SELECT secret_encrypted, recovery_codes_hash, confirmed_at' +
        ' FROM user_mfa_factors WHERE user_id = $1',
      [userId],
    );
    const row = stored.rows[0];
    expect(row.confirmed_at).toBeNull();
    expect(row.secret_encrypted.includes(Buffer.from(secret, 'utf8'))).toBe(false);
    expect(row.secret_encrypted.includes(base32Decode(secret))).toBe(false);
    expect(row.recovery_codes_hash).toHaveLength(10);
    for (const hash of row.recovery_codes_hash) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(recoveryCodes).not.toContain(hash);
    }
    for (const code of recoveryCodes) {
      expect(row.recovery_codes_hash).not.toContain(code);
    }

    const decrypted = await app.db.query<{ dec: string }>(
      'SELECT pgp_sym_decrypt(secret_encrypted, $2) AS dec' +
        ' FROM user_mfa_factors WHERE user_id = $1',
      [userId, process.env.MFA_SECRET_KEY],
    );
    expect(decrypted.rows[0].dec).toBe(secret);
  });

  it('refuses a wrong code and counts the failure', async () => {
    const res = await app.call('POST', '/v1/auth/mfa/verify', {
      headers: { cookie: pendingCookie },
      body: { code: '000000' },
    });
    expect(res.status).toBe(401);
    expect(app.errorOf(res).code).toBe('AUTH_MFA_INVALID');

    const row = await app.db.query<{ failed_attempts: number }>(
      'SELECT failed_attempts FROM user_mfa_factors WHERE user_id = $1',
      [userId],
    );
    expect(row.rows[0].failed_attempts).toBe(1);
  });

  it('locks the factor after five consecutive failures', async () => {
    let last: ApiResponse | undefined;
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      last = await app.call('POST', '/v1/auth/mfa/verify', {
        headers: { cookie: pendingCookie },
        body: { code: '000000' },
      });
    }
    expect(last?.status).toBe(423);
    const envelope = app.errorOf(last as ApiResponse);
    expect(envelope.code).toBe('AUTH_ACCOUNT_LOCKED');
    expect(envelope.retryable).toBe(true);
    const retryAfter = envelope.details?.retry_after_seconds;
    expect(typeof retryAfter).toBe('number');
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(15 * 60);
    expect(last?.headers.get('retry-after')).toBe(String(Math.ceil(Number(retryAfter))));

    const row = await app.db.query<{ locked_until: Date | null; failed_attempts: number }>(
      'SELECT locked_until, failed_attempts FROM user_mfa_factors WHERE user_id = $1',
      [userId],
    );
    expect(row.rows[0].locked_until).not.toBeNull();
    // The counter is reset with the lock, so the window ends in fresh attempts.
    expect(row.rows[0].failed_attempts).toBe(0);
  });

  it('does not let a correct code through while the lock is active', async () => {
    const res = await app.call('POST', '/v1/auth/mfa/verify', {
      headers: { cookie: pendingCookie },
      body: { code: codeFor(secret) },
    });
    expect(res.status).toBe(423);
    expect(app.errorOf(res).code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('does not let a fresh login escape the lock', async () => {
    const res = await app.call('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD },
    });
    expect(res.status).toBe(423);
    expect(app.errorOf(res).code).toBe('AUTH_ACCOUNT_LOCKED');
    // No session is minted for a locked factor.
    expect(res.setCookie).toHaveLength(0);

    // Restarting enrolment must not be a way around the lock either.
    const enroll = await app.call('POST', '/v1/auth/mfa/enroll', {
      headers: { cookie: pendingCookie },
    });
    expect(enroll.status).toBe(423);
    expect(app.errorOf(enroll).code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('activates the session with a correct code and rotates the token', async () => {
    // Move the lock into the past rather than sleeping 15 minutes.
    await app.db.query(
      "UPDATE user_mfa_factors SET locked_until = now() - interval '1 minute'" +
        ' WHERE user_id = $1',
      [userId],
    );
    acceptedCode = codeFor(secret);
    const res = await app.call('POST', '/v1/auth/mfa/verify', {
      headers: { cookie: pendingCookie },
      body: { code: acceptedCode },
    });
    expect(res.status).toBe(200);
    const json = body(res);
    expect(json.mfa_required).toBe(false);
    activeCookie = app.cookieOf(res);
    expect(activeCookie).not.toBe(pendingCookie);

    // The pre-MFA session is revoked, so a fixated token is worthless.
    const stale = await app.call('GET', '/v1/me', { headers: { cookie: pendingCookie } });
    expect(stale.status).toBe(401);

    const me = await app.call('GET', '/v1/me', { headers: { cookie: activeCookie } });
    expect(me.status).toBe(200);
    expect(body(me).user_id).toBe(userId);

    const factor = await app.db.query<{
      confirmed_at: Date | null;
      failed_attempts: number;
      locked_until: Date | null;
      last_used_time_step: string | null;
    }>(
      'SELECT confirmed_at, failed_attempts, locked_until, last_used_time_step' +
        ' FROM user_mfa_factors WHERE user_id = $1',
      [userId],
    );
    expect(factor.rows[0].confirmed_at).not.toBeNull();
    expect(factor.rows[0].failed_attempts).toBe(0);
    expect(factor.rows[0].locked_until).toBeNull();
    // The accepted step is stored so the code cannot be replayed. It is the
    // current step unless the 30s boundary was crossed during the request.
    const storedStep = Number(factor.rows[0].last_used_time_step);
    expect(Math.abs(storedStep - timeStepAt(Date.now()))).toBeLessThanOrEqual(1);
  });

  it('refuses a replay of the code that just worked', async () => {
    const res = await app.call('POST', '/v1/auth/mfa/verify', {
      headers: { cookie: activeCookie },
      body: { code: acceptedCode },
    });
    expect(res.status).toBe(401);
    expect(app.errorOf(res).code).toBe('AUTH_MFA_INVALID');
  });

  it('never returns the secret, a recovery code or a token from GET /v1/me', async () => {
    const res = await app.call('GET', '/v1/me', { headers: { cookie: activeCookie } });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(secret);
    expect(res.text.toLowerCase()).not.toContain('token');
    expect(res.text.toLowerCase()).not.toContain('secret');
    expect(res.text.toLowerCase()).not.toContain('recovery');
    for (const code of recoveryCodes) {
      expect(res.text).not.toContain(code);
    }
  });

  it('keeps every secret out of the audit trail', async () => {
    const audit = await app.db.query<{ action: string; metadata: string }>(
      'SELECT action, metadata::text AS metadata FROM audit_events WHERE actor_id = $1',
      [userId],
    );
    const actions = audit.rows.map((row) => row.action);
    expect(actions).toContain('auth.mfa_enroll_started');
    expect(actions).toContain('auth.mfa_failed');
    expect(actions).toContain('auth.mfa_locked');
    expect(actions).toContain('auth.mfa_enrolled');

    const dump = audit.rows.map((row) => row.metadata).join('\n');
    expect(dump).not.toContain(secret);
    for (const code of recoveryCodes) {
      expect(dump).not.toContain(code);
    }
  });

  it('refuses a second enrolment once the factor is confirmed', async () => {
    const res = await app.call('POST', '/v1/auth/mfa/enroll', {
      headers: { cookie: activeCookie },
    });
    expect(res.status).toBe(409);
    expect(app.errorOf(res).code).toBe('AUTH_MFA_ALREADY_ENROLLED');
  });
});

describe('ENG002-T04 the gate follows the role, not the login moment', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp('t04gate');
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  }, 60000);

  it('does not gate a customer with no staff membership', async () => {
    const user = await app.verifiedUser();
    const me = await app.call('GET', '/v1/me', { headers: { cookie: user.cookie } });
    expect(me.status).toBe(200);

    const login = await app.call('POST', '/v1/auth/login', {
      body: { email: user.email, password: PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(body(login).mfa_required).toBe(false);
    expect(body(login).mfa_enrollment_required).toBe(false);
  });

  it('stops an already-active session when a gated role is granted to it', async () => {
    const user = await app.verifiedUser();
    const before = await app.call('GET', '/v1/me', { headers: { cookie: user.cookie } });
    expect(before.status).toBe(200);

    await grantRole(app, user.userId, 'VENUE_MANAGER');

    const after = await app.call('GET', '/v1/me', { headers: { cookie: user.cookie } });
    expect(after.status).toBe(403);
    expect(app.errorOf(after).code).toBe('AUTH_MFA_REQUIRED');
  });

  it('does not gate a reception membership, which is not in D2', async () => {
    const user = await app.verifiedUser();
    await grantRole(app, user.userId, 'RECEPTION');
    const me = await app.call('GET', '/v1/me', { headers: { cookie: user.cookie } });
    expect(me.status).toBe(200);
  });
});
