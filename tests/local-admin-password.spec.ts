import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { request as httpRequest } from 'node:http';
import { hash } from '../src/auth/password';
import { hashToken } from '../src/auth/tokens';
import { IDLE_TTL_MS } from '../src/auth/auth.constants';
import { base32Decode, hotp, timeStepAt } from '../src/auth/totp';
import { startTestApp, PASSWORD, type TestApp } from './support/auth-harness';

const origin = 'https://127.0.0.1:5173';
const headers = { origin, 'x-gamerbooker-csrf': '1' };
const userId = randomUUID();
const email = 'dedicated-local-admin@example.test';
const oldTokens = ['old-pending-'.padEnd(48, 'a'), 'old-active-'.padEnd(48, 'b')];
let passwordHash: string;

async function seed(db: Client) {
  await db.query("INSERT INTO users(id,email,password_hash,email_verified_at,identity_status) VALUES($1,$2,$3,now(),'verified')", [userId, email, passwordHash]);
  await db.query("INSERT INTO platform_grants(user_id,operator_reference) VALUES($1,'DISPOSABLE-TEST')", [userId]);
  for (const [index, token] of oldTokens.entries()) await db.query("INSERT INTO sessions(user_id,token_hash,kind,mfa_state,idle_expires_at,absolute_expires_at) VALUES($1,$2,'dashboard',$3,now()+interval '1 hour',now()+interval '1 day')", [userId, hashToken(token), index === 0 ? 'pending' : 'active']);
}

describe('Explicit dedicated local administrator password mode (disposable DB)', () => {
  let app: TestApp;
  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    app = await startTestApp('local_admin_password', { localAdmin: { userId }, beforeInit: seed });
  });
  afterAll(async () => { if (app) await app.stop(); });
  const login = (extra: Record<string, string> = {}, kind = 'dashboard', password = PASSWORD, identity = email) => app.call('POST', '/v1/auth/login', { headers: { ...headers, ...extra }, body: { email: identity, password, kind } });
  async function fresh() {
    const response = await login(); expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ mfa_required: false, auth_mode: 'local_admin_password' });
    return app.cookieOf(response);
  }
  const context = (cookie: string, extra: Record<string, string> = {}) => app.call('GET', '/v1/access/context', { headers: { cookie, ...extra } });

  it('audits activation and revokes both old pending and old active sessions', async () => {
    for (const token of oldTokens) expect((await context('__Host-gb_session=' + token)).status).toBe(401);
    const audit = await app.db.query("SELECT actor_role,metadata FROM audit_events WHERE action='auth.local_admin_mode_activated' AND target_id=$1", [userId]);
    expect(audit.rows).toEqual([{ actor_role: 'LOCAL_RUNTIME', metadata: { revoked_sessions: 2, mode: 'loopback_password_only' } }]);
  });
  it('uses a fresh password cookie with no forged MFA timestamp or factor; Origin-less GET works', async () => {
    const cookie = await fresh();
    const access = await context(cookie);
    expect(access.status).toBe(200);
    expect(access.json).toMatchObject({ platform_admin: true, local_admin_password_only: true, venues: [] });
    expect((await app.call('GET', '/v1/admin/cafe-applications', { headers: { cookie } })).status).toBe(200);
    const row = (await app.db.query('SELECT mfa_state,mfa_verified_at FROM sessions WHERE token_hash=$1', [hashToken(cookie.split('=')[1])])).rows[0];
    expect(row).toEqual({ mfa_state: 'active', mfa_verified_at: null });
    expect((await app.db.query('SELECT 1 FROM user_mfa_factors WHERE user_id=$1', [userId])).rowCount).toBe(0);
  });
  it('keeps password validation, verified identity, CSRF and Origin enforcement', async () => {
    expect((await login({}, 'dashboard', 'incorrect test password')).status).toBe(401);
    expect((await app.call('POST', '/v1/auth/login', { headers: { origin }, body: { email, password: PASSWORD } })).status).toBe(403);
    expect((await login({ origin: 'https://foreign.example.test' })).status).toBe(403);
    await app.db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1', [userId]);
    try { expect((await login()).status).toBe(403); }
    finally { await app.db.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [userId]); }
    const noOrigin = await app.call('POST', '/v1/auth/login', { headers: { 'x-gamerbooker-csrf': '1' }, body: { email, password: PASSWORD } });
    expect(noOrigin.json).toMatchObject({ mfa_required: true });
    expect((await context(app.cookieOf(noOrigin))).status).toBe(403);
  });
  it('does not consult an unused locked TOTP factor for the eligible local password path', async () => {
    const factor = (await app.db.query("INSERT INTO user_mfa_factors(user_id,secret_encrypted,confirmed_at,locked_until,failed_attempts) VALUES($1,decode('00','hex'),now(),now()+interval '1 hour',3) RETURNING id,locked_until,failed_attempts", [userId])).rows[0];
    try {
      expect((await context(await fresh())).status).toBe(200);
      const stillLocked = (await app.db.query('SELECT id,locked_until,failed_attempts FROM user_mfa_factors WHERE id=$1', [factor.id])).rows[0];
      expect(stillLocked).toEqual(factor);
      // Without the exact local request boundary, the original factor lock applies.
      expect((await login({ 'x-forwarded-for': '127.0.0.1' })).status).toBe(423);
    } finally { await app.db.query('DELETE FROM user_mfa_factors WHERE id=$1', [factor.id]); }
  });
  it('refuses mobile, bearer, foreign Host/Origin and forwarded evidence', async () => {
    const cookie = await fresh();
    expect((await context(cookie, { origin: 'https://foreign.example.test' })).status).toBe(401);
    const foreignHostStatus = await new Promise<number>(resolve => {
      const request = httpRequest(app.baseUrl + '/v1/access/context', { headers: { host: 'example.test', cookie } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode!));
      });
      request.end();
    });
    expect(foreignHostStatus).toBe(401);
    for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']) {
      expect((await context(cookie, { [name]: '127.0.0.1' })).status).toBe(401);
      expect((await login({ [name]: '127.0.0.1' })).json).toMatchObject({ mfa_required: true });
    }
    const bearer = await app.call('GET', '/v1/access/context', { headers: { authorization: 'Bearer ' + cookie.split('=')[1] } });
    expect(bearer.status).toBe(401);
    expect((await context(cookie, { authorization: 'Bearer ' + cookie.split('=')[1] })).status).toBe(401);
    const mobile = await login({}, 'mobile');
    expect(mobile.json).toMatchObject({ kind: 'mobile', mfa_required: true });
    expect((await app.call('GET', '/v1/admin/cafe-applications', { headers: { authorization: 'Bearer ' + (mobile.json as {token: string}).token } })).status).toBe(403);
  });
  it('denies missing, expired, revoked and unknown old database-only sessions', async () => {
    expect((await app.call('GET', '/v1/access/context')).status).toBe(401);
    const expired = await fresh();
    await app.db.query("UPDATE sessions SET idle_expires_at=now()-interval '1 second' WHERE token_hash=$1", [hashToken(expired.split('=')[1])]);
    expect((await context(expired)).status).toBe(401);
    const revoked = await fresh();
    await app.db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(revoked.split('=')[1])]);
    expect((await context(revoked)).status).toBe(401);
    const token = 'db-only-old-session'.padEnd(48, 'c');
    await app.db.query("INSERT INTO sessions(user_id,token_hash,kind,mfa_state,idle_expires_at,absolute_expires_at) VALUES($1,$2,'dashboard','active',now()+interval '1 hour',now()+interval '1 day')", [userId, hashToken(token)]);
    expect((await context('__Host-gb_session=' + token)).status).toBe(401);
  });
  it('requires fresh login after proof expiry or simulated provider destruction, not TOTP', async () => {
    const expiredProof = await fresh();
    const now = Date.now(); const clock = jest.spyOn(Date, 'now').mockReturnValue(now + IDLE_TTL_MS + 1000);
    try { expect((await context(expiredProof)).status).toBe(401); }
    finally { clock.mockRestore(); }
    const beforeLifecycle = await fresh();
    app.localAdminPolicy.onModuleDestroy(); // Lifecycle proof loss; DB/server are intentionally unchanged.
    expect((await context(beforeLifecycle)).status).toBe(401);
    expect((await context(await fresh())).status).toBe(200);
  });
  it('rechecks live grant and never restores a revoked proof just by restoring the grant', async () => {
    const cookie = await fresh();
    await app.db.query('UPDATE platform_grants SET revoked_at=now() WHERE user_id=$1', [userId]);
    try {
      expect((await context(cookie)).status).toBe(401);
      const noGrant = await login();
      expect((await context(app.cookieOf(noGrant))).status).toBe(401);
    } finally { await app.db.query('UPDATE platform_grants SET revoked_at=NULL WHERE user_id=$1', [userId]); }
    expect((await context(cookie)).status).toBe(401);
  });
  it('denies deletion, suspension and any active cafe membership on each request', async () => {
    for (const change of ["deleted_at=now()", "identity_status='suspended'"]) {
      const cookie = await fresh(); await app.db.query('UPDATE users SET ' + change + ' WHERE id=$1', [userId]);
      try { expect((await context(cookie)).status).toBe(401); }
      finally { await app.db.query("UPDATE users SET deleted_at=NULL,identity_status='verified' WHERE id=$1", [userId]); }
    }
    const cookie = await fresh();
    const tenant = (await app.db.query("INSERT INTO tenants(legal_name) VALUES('Disposable cafe') RETURNING id")).rows[0].id;
    const venue = (await app.db.query("INSERT INTO venues(tenant_id,name) VALUES($1,'Disposable cafe') RETURNING id", [tenant])).rows[0].id;
    await app.db.query("INSERT INTO venue_memberships(user_id,tenant_id,venue_id,role,active) VALUES($1,$2,$3,'RECEPTION',true)", [userId, tenant, venue]);
    try { expect((await context(cookie)).status).toBe(401); }
    finally { await app.db.query('UPDATE venue_memberships SET active=false WHERE user_id=$1', [userId]); }
    expect((await context(cookie)).status).toBe(401);
  });
  it('keeps other administrators and company OWNER/MANAGER accounts on real TOTP', async () => {
    for (const role of ['admin', 'OWNER', 'VENUE_MANAGER']) {
      const id = randomUUID(); const identity = role.toLowerCase() + '@example.test';
      await app.db.query("INSERT INTO users(id,email,password_hash,email_verified_at,identity_status) VALUES($1,$2,$3,now(),'verified')", [id, identity, passwordHash]);
      if (role === 'admin') await app.db.query("INSERT INTO platform_grants(user_id,operator_reference) VALUES($1,'DISPOSABLE-OTHER')", [id]);
      else {
        const venue = (await app.db.query('SELECT id,tenant_id FROM venues LIMIT 1')).rows[0];
        await app.db.query('INSERT INTO venue_memberships(user_id,venue_id,tenant_id,role,active) VALUES($1,$2,$3,$4,true)', [id, venue.id, venue.tenant_id, role]);
      }
      const response = await login({}, 'dashboard', PASSWORD, identity);
      expect(response.json).toMatchObject({ mfa_required: true });
      expect((await context(app.cookieOf(response))).status).toBe(403);
      if (role === 'OWNER' || role === 'VENUE_MANAGER') {
        const factor = (await app.db.query("INSERT INTO user_mfa_factors(user_id,secret_encrypted,locked_until) VALUES($1,decode('00','hex'),now()+interval '1 hour') RETURNING id", [id])).rows[0];
        expect((await login({}, 'dashboard', PASSWORD, identity)).status).toBe(423);
        await app.db.query('DELETE FROM user_mfa_factors WHERE id=$1', [factor.id]);
      }
      if (role === 'admin') {
        const enrolled = await app.call('POST', '/v1/auth/mfa/enroll', { headers: { ...headers, cookie: app.cookieOf(response) } });
        const code = hotp(base32Decode((enrolled.json as {secret: string}).secret), timeStepAt(Date.now()));
        const verified = await app.call('POST', '/v1/auth/mfa/verify', { headers: { ...headers, cookie: app.cookieOf(response) }, body: { code } });
        expect(verified.status).toBe(200);
        expect((await app.call('GET', '/v1/admin/cafe-applications', { headers: { cookie: app.cookieOf(verified) } })).status).toBe(200);
      }
    }
  });
});

describe.each([
  ['default off', { enabled: false }],
  ['production', { environment: 'production' }],
  ['nonloopback configured API host', { apiHost: '0.0.0.0' }],
  ['nonlocal configured dashboard origin', { origins: 'https://dashboard.example.test' }],
  ['IPv6 actual loopback listener outside the configured IPv4 boundary', {}],
] as const)('Fail-closed mode: %s', (label, configuration) => {
  let app: TestApp;
  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    app = await startTestApp('local_admin_config', { localAdmin: { userId, ...configuration }, beforeInit: seed,
      ...(label.startsWith('IPv6') ? { listenHost: '::1' as const } : {}) });
  });
  afterAll(async () => { if (app) await app.stop(); });
  it('cannot use the password-only exception or client assertions', async () => {
    // Mutating environment after construction must not turn a disabled policy on.
    if (label === 'default off') process.env.LOCAL_ADMIN_PASSWORD_ONLY = '1';
    const response = await app.call('POST', '/v1/auth/login', { headers: { ...headers, ...(label.includes('dashboard origin') ? { origin: 'https://dashboard.example.test' } : {}), 'x-local-admin': 'true', 'x-role': 'PLATFORM_ADMIN' }, body: { email, password: PASSWORD, kind: 'dashboard' } });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ mfa_required: true });
    expect((await app.call('GET', '/v1/admin/cafe-applications', { headers: { cookie: app.cookieOf(response) } })).status).toBe(403);
  });
});
