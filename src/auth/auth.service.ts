import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { getPool } from '../db/pool';
import { getRequestId } from '../common/request-context';
import {
  ABSOLUTE_TTL_MS,
  IDLE_TTL_MS,
  USERS_EMAIL_CONSTRAINT,
  VERIFICATION_TTL_MS,
} from './auth.constants';
import { AuthHttpError } from './auth-error';
import { hash as hashPassword, verify as verifyPassword, verifyDummy } from './password';
import { hashToken, newSessionToken, newVerificationToken } from './tokens';
import type { LoginInput, RegisterInput, SessionKind } from './validation';

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
  token: string;
  kind: SessionKind;
  userId: string;
  /** Idle expiry, the value the cookie Max-Age and the JSON body report. */
  expiresAt: Date;
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
  sessionId: string;
  userId: string;
  kind: SessionKind;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified_at: Date | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly isDev = process.env.NODE_ENV === 'development';

  /**
   * Creates an unverified account and one 24h email_verify token.
   * User row and token row commit together or not at all.
   */
  async register(input: RegisterInput): Promise<{ user_id: string; verification_token?: string }> {
    const passwordHash = await hashPassword(input.password);
    const client = await getPool().connect();
    let userId: string | undefined;
    let rawToken: string | undefined;
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [input.email, passwordHash],
      );
      userId = inserted.rows[0].id;

      const token = newVerificationToken();
      rawToken = token.token;
      const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
      await client.query(
        'INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at) ' +
          ' VALUES ($1, $2, $3, $4)',
        [userId, token.hash, 'email_verify', expiresAt],
      );
      await this.writeAudit(client, 'auth.register', userId, {});
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw classifyRegisterError(err);
    } finally {
      client.release();
    }

    // D1: development-only delivery. Only the SHA-256 digest is stored, so the
    // raw value cannot be read back; it is returned exactly once, here, and
    // only when NODE_ENV=development. Never logged.
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
    const found = await getPool().query<{ id: string }>(
      'SELECT id FROM users' +
        ' WHERE lower(email) = $1 AND deleted_at IS NULL AND email_verified_at IS NULL',
      [email],
    );
    const user = found.rows[0];
    if (!user) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    }
    const token = newVerificationToken();
    await getPool().query(
      'INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)' +
        ' VALUES ($1, $2, $3, $4)',
      [user.id, token.hash, 'email_verify', new Date(Date.now() + VERIFICATION_TTL_MS)],
    );
    return { token: token.token };
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
      await this.writeAudit(client, 'auth.verify_email', row.user_id, {});
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
  async login(input: LoginInput): Promise<LoginResult> {
    const pool = getPool();
    const found = await pool.query<UserRow>(
      'SELECT id, email, password_hash, email_verified_at FROM users ' +
        ' WHERE lower(email) = $1 AND deleted_at IS NULL',
      [input.email],
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

    // A fresh token on every login: session fixation is impossible because no
    // caller-supplied value is ever adopted (ENG002-T06).
    const minted = newSessionToken();
    const idleExpiresAt = new Date(Date.now() + IDLE_TTL_MS);
    const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO sessions (user_id, token_hash, kind, mfa_state, idle_expires_at, absolute_expires_at) ' +
          " VALUES ($1, $2, $3, 'active', $4, $5)",
        [user.id, minted.hash, input.kind, idleExpiresAt, absoluteExpiresAt],
      );
      await this.writeAudit(client, 'auth.login', user.id, { kind: input.kind });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    return {
      token: minted.token,
      kind: input.kind,
      userId: user.id,
      expiresAt: idleExpiresAt,
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
      await this.writeAudit(client, 'auth.logout', principal.userId, {
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
      'SELECT tenant_id, venue_id, role FROM venue_memberships' +
        ' WHERE user_id = $1 AND active = true ORDER BY venue_id',
      [principal.userId],
    );
    return { user_id: user.id, email: user.email, memberships: memberships.rows };
  }

  /**
   * Append-only audit row. Metadata carries no email, phone, token or password:
   * callers pass only non-identifying facts. Writes inside the caller's
   * transaction so a failed business change cannot leave an orphan audit.
   */
  private async writeAudit(
    db: DbExecutor,
    action: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      'INSERT INTO audit_events (actor_user_id, action, metadata, request_id)' +
        ' VALUES ($1, $2, $3::jsonb, $4)',
      [actorUserId, action, JSON.stringify(metadata), getRequestId() ?? null],
    );
  }
}

function invalidCredentials(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_INVALID_CREDENTIALS', GENERIC_CREDENTIALS);
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

