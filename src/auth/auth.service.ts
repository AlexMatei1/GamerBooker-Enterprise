import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { getPool } from '../db/pool';
import {
  ABSOLUTE_TTL_MS,
  HTTP_LOCKED,
  IDLE_TTL_MS,
  USERS_EMAIL_CONSTRAINT,
  VERIFICATION_TTL_MS,
} from './auth.constants';
import { AuthHttpError } from './auth-error';
import { writeAudit } from './audit';
import { MFA_GATED_ROLES } from './membership.service';
import { hash as hashPassword, verify as verifyPassword, verifyDummy } from './password';
import { hashToken, newSessionToken, newVerificationToken } from './tokens';
import type { DeleteReason, LoginInput, RegisterInput, SessionKind } from './validation';
import { LocalAdminPolicy, type LocalAdminRequest } from './local-admin-policy';

const GENERIC_CREDENTIALS = 'Email or password is incorrect.';
const UNVERIFIED_MESSAGE = 'Email address is not verified.';
const INVALID_TOKEN_MESSAGE = 'The verification link is invalid or has expired.';
const REGISTERED_MESSAGE = 'This email address cannot be registered.';
const REQUIRED_MESSAGE = 'Authentication is required.';

/** The only query surface the service needs; satisfied by Pool and PoolClient. */
export interface DbExecutor {
  query<T = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface LoginResult {
  localAdminPasswordOnly?: boolean;
  token: string;
  kind: SessionKind;
  userId: string;
  /** Idle expiry, the value the cookie Max-Age and the JSON body report. */
  expiresAt: Date;
  /** 'pending' when the second factor still has to be proven (D2, D10). */
  mfaState: 'pending' | 'active';
  /** True when the user must enrol a factor before the session can activate. */
  mfaEnrollmentRequired: boolean;
}

export interface MeMembership {
  tenant_id: string;
  venue_id: string;
  role: string;
}

export interface MeResult {
  user_id: string;
  email: string;
  memberships: MeMembership[];
}

export interface SessionPrincipal {
  localAdminPasswordOnly?: boolean;
  sessionId: string;
  userId: string;
  kind: SessionKind;
  mfaState: 'pending' | 'active';
}

export interface DeleteAccountResult {
  sessionsRevoked: number;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified_at: Date | null;
  /** True when an active membership in a gated role exists (D2). */
  mfa_gated: boolean;
  /** True when a confirmed TOTP factor exists. */
  mfa_enrolled: boolean;
  /** Set while the factor is locked after repeated failures (D11). */
  mfa_locked_until: Date | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly localAdmin: LocalAdminPolicy) {}

  /**
   * Creates an account. Local development accounts are immediately verified;
   * access to company operations still requires platform approval.
   */
  async register(input: RegisterInput): Promise<{ user_id: string; verification_token?: string }> {
    const passwordHash = await hashPassword(input.password);
    const client = await getPool().connect();
    let userId: string | undefined;
    let rawToken: string | undefined;
    try {
      await client.query('BEGIN');
      const localRegistration = process.env.LOCAL_COMPANY_APPROVAL_ONLY === '1';
      const inserted = await client.query<{ id: string }>(
        localRegistration
          ? "INSERT INTO users (email, password_hash, email_verified_at, identity_status) VALUES ($1, $2, now(), 'verified') RETURNING id"
          : 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [input.email, passwordHash],
      );
      userId = inserted.rows[0].id;

      if (!localRegistration) {
        const token = newVerificationToken();
        rawToken = token.token;
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
        await client.query(
          'INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)',
          [userId, token.hash, 'email_verify', expiresAt],
        );
      }
      await writeAudit(client, 'auth.register', userId, { local_email_verification_skipped: localRegistration });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw classifyRegisterError(err);
    } finally {
      client.release();
    }

    // Local company-approval mode skips email verification. Otherwise preserve
    // the development-only token delivery used by the isolated auth suites.
    if (process.env.LOCAL_COMPANY_APPROVAL_ONLY === '1') return { user_id: userId };
    if (this.isDevShortCircuit()) {
      this.logger.debug('verification token issued for user ' + userId);
      return { user_id: userId, verification_token: rawToken };
    }
    return { user_id: userId };
  }

  /**
   * Development-only re-issue (HANDOFF-ENG-002 D1). The digest is all that is
   * stored, so an already-issued token cannot be shown again; this mints a new
   * one for an unverified account. Mounted only when NODE_ENV=development.
   */
  async issueDevVerificationToken(email: string): Promise<{ token: string }> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ id: string }>(
        'SELECT id FROM users' +
          ' WHERE lower(email) = $1 AND deleted_at IS NULL AND email_verified_at IS NULL',
        [email],
      );
      const user = found.rows[0];
      if (!user) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Resource not found.');
      }
      // Supersede before issuing. Leaving older tokens live would mean every
      // token ever issued for this account stays usable for its full 24h,
      // which is a fan-out nobody can revoke.
      await client.query(
        'UPDATE verification_tokens SET consumed_at = now(), updated_at = now()' +
          " WHERE user_id = $1 AND purpose = 'email_verify' AND consumed_at IS NULL",
        [user.id],
      );
      const token = newVerificationToken();
      await client.query(
        'INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)' +
          ' VALUES ($1, $2, $3, $4)',
        [user.id, token.hash, 'email_verify', new Date(Date.now() + VERIFICATION_TTL_MS)],
      );
      await writeAudit(client, 'auth.dev_verification_reissued', user.id, {});
      await client.query('COMMIT');
      return { token: token.token };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private isDevShortCircuit(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /** Consumes a live email_verify token and flips the account to verified. */
  async verifyEmail(token: string): Promise<{ user_id: string }> {
    const client = await getPool().connect();
    let userId: string;
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        user_id: string;
        consumed_at: Date | null;
        expires_at: Date;
      }>(
        'SELECT id, user_id, consumed_at, expires_at FROM verification_tokens ' +
          ' WHERE token_hash = $1 AND purpose = $2 FOR UPDATE',
        [hashToken(token), 'email_verify'],
      );
      const row = found.rows[0];
      if (!row || row.consumed_at !== null || row.expires_at.getTime() <= Date.now()) {
        throw invalidInvitation();
      }

      await client.query(
        'UPDATE users SET email_verified_at = now(), identity_status = $2, updated_at = now() ' +
          ' WHERE id = $1 AND deleted_at IS NULL',
        [row.user_id, 'verified'],
      );
      await client.query(
        'UPDATE verification_tokens SET consumed_at = now(), updated_at = now() WHERE id = $1',
        [row.id],
      );
      await writeAudit(client, 'auth.verify_email', row.user_id, {});
      await client.query('COMMIT');
      userId = row.user_id;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { user_id: userId };
  }

  /**
   * Password login. An unknown email pays the same Argon2id cost as a wrong
   * password and returns the identical 401 (ENG002-T05). Email-unverified is
   * only reported after the password has been proven correct.
   */
  async login(input: LoginInput, request?: LocalAdminRequest): Promise<LoginResult> {
    const pool = getPool();
    const found = await pool.query<UserRow>(
      'SELECT u.id, u.email, u.password_hash, u.email_verified_at,' +
        ' (EXISTS (SELECT 1 FROM venue_memberships m' +
        '   WHERE m.user_id = u.id AND m.active = true AND m.role = ANY($2::text[]))' +
        ' OR EXISTS (SELECT 1 FROM platform_grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL))' +
        '   AS mfa_gated,' +
        ' EXISTS (SELECT 1 FROM user_mfa_factors f' +
        "   WHERE f.user_id = u.id AND f.type = 'totp' AND f.confirmed_at IS NOT NULL)" +
        '   AS mfa_enrolled,' +
        ' (SELECT f.locked_until FROM user_mfa_factors f' +
        "   WHERE f.user_id = u.id AND f.type = 'totp')" +
        '   AS mfa_locked_until' +
        ' FROM users u' +
        " WHERE lower(u.email) = $1 AND u.deleted_at IS NULL AND u.identity_status<>'suspended'",
      [input.email, MFA_GATED_ROLES],
    );
    const user = found.rows[0];

    if (!user) {
      await verifyDummy();
      throw invalidCredentials();
    }

    const ok = user.password_hash
      ? await verifyPassword(user.password_hash, input.password)
      : await verifyDummy();
    if (!ok) {
      throw invalidCredentials();
    }

    if (!user.email_verified_at) {
      throw new AuthHttpError(HttpStatus.FORBIDDEN, 'AUTH_EMAIL_UNVERIFIED', UNVERIFIED_MESSAGE);
    }

    // Checked only after the password is correct, so a lockout never becomes an
    // account-existence oracle. Ordinary MFA logins cannot escape a factor lock.
    // The explicit local password path does not use or modify the TOTP factor.
    let localPassword = false;
    let mfaPending = user.mfa_enrolled || user.mfa_gated;
    let mfaState: 'pending' | 'active' = mfaPending ? 'pending' : 'active';
    let sessionId: string;

    // A fresh token on every login: session fixation is impossible because no
    // caller-supplied value is ever adopted (ENG002-T06).
    const minted = newSessionToken();
    const idleExpiresAt = new Date(Date.now() + IDLE_TTL_MS);
    const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      localPassword = await this.localAdmin.loginAllowed(user.id, input.kind, request, client);
      if (localPassword) { mfaPending = false; mfaState = 'active'; }
      if (!localPassword && user.mfa_locked_until) {
        const lockedMs = new Date(user.mfa_locked_until).getTime() - Date.now();
        if (lockedMs > 0) throw accountLocked(Math.max(1, Math.ceil(lockedMs / 1000)));
      }
      const inserted = await client.query<{id: string}>(
        'INSERT INTO sessions (user_id, token_hash, kind, mfa_state, idle_expires_at, absolute_expires_at) ' +
          ' VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [user.id, minted.hash, input.kind, mfaState, idleExpiresAt, absoluteExpiresAt],
      );
      sessionId = inserted.rows[0].id;
      await writeAudit(client, 'auth.login', user.id, { kind: input.kind, mfa_state: mfaState, ...(localPassword ? {auth_mode: 'local_admin_password'} : {}) });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    if (localPassword) this.localAdmin.rememberFreshLogin(sessionId!, user.id, absoluteExpiresAt);

    return {
      localAdminPasswordOnly: localPassword,
      token: minted.token,
      kind: input.kind,
      userId: user.id,
      expiresAt: idleExpiresAt,
      mfaState,
      mfaEnrollmentRequired: mfaPending && !user.mfa_enrolled,
    };
  }

  /** Revokes the presented session only. Never touches another user's rows. */
  async logout(principal: SessionPrincipal): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(
        'UPDATE sessions SET revoked_at = now(), updated_at = now() ' +
          ' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [principal.sessionId, principal.userId],
      );
      await writeAudit(client, 'auth.logout', principal.userId, {
        revoked: (revoked.rowCount ?? 0) > 0,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Caller identity and the active memberships it holds. The user id is the
   * authenticated one in req.auth, never a value taken from the request.
   * The password hash, tokens and MFA secrets are not selected at all.
   */
  async me(principal: SessionPrincipal): Promise<MeResult> {
    const pool = getPool();
    const found = await pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL',
      [principal.userId],
    );
    const user = found.rows[0];
    if (!user) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
    }
    const memberships = await pool.query<MeMembership>(
      `SELECT m.tenant_id,m.venue_id,m.role FROM venue_memberships m
       JOIN venues v ON v.id=m.venue_id AND v.tenant_id=m.tenant_id
       JOIN tenants t ON t.id=v.tenant_id AND t.state='active'
       WHERE m.user_id=$1 AND m.active=true AND m.role IN ('OWNER','VENUE_MANAGER','RECEPTION','BAR_STAFF')
       AND NOT EXISTS (SELECT 1 FROM platform_grants g WHERE g.user_id=m.user_id AND g.revoked_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM cafe_applications a WHERE a.applicant_user_id=m.user_id AND a.venue_id=m.venue_id AND a.access_suspended=true)
       ORDER BY m.venue_id`,
      [principal.userId],
    );
    return { user_id: user.id, email: user.email, memberships: memberships.rows };
  }

  /**
   * Revokes every session the user holds, including the one making the call.
   * One transaction, so the audit row and the revocation cannot disagree.
   */
  async logoutAll(principal: SessionPrincipal): Promise<number> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(
        'UPDATE sessions SET revoked_at = now(), updated_at = now()' +
          ' WHERE user_id = $1 AND revoked_at IS NULL',
        [principal.userId],
      );
      const count = revoked.rowCount ?? 0;
      await writeAudit(client, 'auth.logout_all', principal.userId, { revoked: count });
      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Closes the caller's own account (ENG002-T07).
   *
   * Irreversible and anonymizing: the address is replaced with one that can
   * never receive mail, the phone and the password hash are removed, and every
   * session and outstanding token is revoked in the same transaction that
   * writes the audit row. The row itself survives so the audit trail keeps its
   * foreign key and the deletion stays provable.
   *
   * The password is required: a stolen session alone must not be enough to
   * destroy an account.
   */
  async deleteAccount(
    principal: SessionPrincipal,
    password: string,
    reason: DeleteReason,
  ): Promise<DeleteAccountResult> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ id: string; password_hash: string | null }>(
        'SELECT id, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [principal.userId],
      );
      const user = found.rows[0];
      if (!user) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
      }

      // Same cost whether the hash is missing or the password is wrong.
      const ok = user.password_hash
        ? await verifyPassword(user.password_hash, password)
        : await verifyDummy();
      if (!ok) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw invalidCredentials();
      }

      await client.query(
        "UPDATE users SET email = 'deleted+' || id::text || '@deleted.invalid'," +
          ' phone = NULL, phone_verified_at = NULL, password_hash = NULL,' +
          " identity_status = 'suspended', deleted_at = now(), updated_at = now()" +
          ' WHERE id = $1',
        [user.id],
      );
      const revoked = await client.query(
        'UPDATE sessions SET revoked_at = now(), updated_at = now()' +
          ' WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id],
      );
      await client.query(
        'UPDATE verification_tokens SET consumed_at = now(), updated_at = now()' +
          ' WHERE user_id = $1 AND consumed_at IS NULL',
        [user.id],
      );
      const sessionsRevoked = revoked.rowCount ?? 0;
      // reason is a closed set of codes, never free text: see validation.ts.
      await writeAudit(client, 'account.delete', user.id, {
        reason,
        sessions_revoked: sessionsRevoked,
      });
      await client.query('COMMIT');
      return { sessionsRevoked };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async changePassword(principal: SessionPrincipal, currentPassword: string, newPassword: string): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ id: string; password_hash: string | null }>(
        'SELECT id, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [principal.userId],
      );
      const user = found.rows[0];
      if (!user) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
      }

      const ok = user.password_hash
        ? await verifyPassword(user.password_hash, currentPassword)
        : await verifyDummy();
      if (!ok) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw invalidCredentials();
      }

      const newHash = await hashPassword(newPassword);
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [principal.userId, newHash]);

      await writeAudit(client, 'auth.password_changed', principal.userId, {
        kind: principal.kind,
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Append-only audit rows are written by ./audit.ts, so this class and the MFA
   * service cannot drift on the envelope, the request id rule or the PII rule.
   */
}

function invalidCredentials(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_INVALID_CREDENTIALS', GENERIC_CREDENTIALS);
}

/** 423 with a concrete wait, so the client does not have to guess. */
function accountLocked(retryAfterSeconds: number): AuthHttpError {
  return new AuthHttpError(
    HTTP_LOCKED,
    'AUTH_ACCOUNT_LOCKED',
    'Too many verification attempts; this account is temporarily locked.',
    { retry_after_seconds: retryAfterSeconds },
  );
}

function invalidInvitation(): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, 'AUTH_INVITATION_INVALID', INVALID_TOKEN_MESSAGE);
}

/**
 * A unique-violation on the email index is the only registration conflict the
 * client may learn about. Everything else is rethrown untouched and becomes a
 * generic 500 at the filter, so SQL text never reaches the caller.
 */
function classifyRegisterError(err: unknown): unknown {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    const constraint = (err as { constraint?: unknown }).constraint;
    if (code === '23505' && constraint === USERS_EMAIL_CONSTRAINT) {
      return new AuthHttpError(HttpStatus.CONFLICT, 'EMAIL_ALREADY_REGISTERED', REGISTERED_MESSAGE);
    }
  }
  return err;
}

