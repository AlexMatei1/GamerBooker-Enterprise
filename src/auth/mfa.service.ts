import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { ABSOLUTE_TTL_MS, HTTP_LOCKED, IDLE_TTL_MS } from './auth.constants';
import { AuthHttpError } from './auth-error';
import { writeAudit } from './audit';
import type { DbExecutor, SessionPrincipal } from './auth.service';
import { newSessionToken } from './tokens';
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  checkTotp,
  hashRecoveryCode,
  mfaKey,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
} from './mfa-crypto';
import type { SessionKind } from './validation';

export interface EnrollResult {
  secret: string;
  otpauth_uri: string;
  recovery_codes: string[];
}

export interface MfaVerifyResult {
  token: string;
  kind: SessionKind;
  userId: string;
  /** Idle expiry, the value the cookie Max-Age and the JSON body report. */
  expiresAt: Date;
}

interface FactorRow {
  id: string;
  secret_encrypted: Buffer;
  confirmed_at: Date | null;
  failed_attempts: number;
  locked_until: Date | null;
  last_used_time_step: string | null;
}

const MFA_INVALID_MESSAGE = 'The verification code is invalid.';
const LOCKED_MESSAGE = 'Too many verification attempts; this account is temporarily locked.';
const ALREADY_ENROLLED_MESSAGE = 'Two-factor authentication is already enabled for this account.';
const REQUIRED_MESSAGE = 'Authentication is required.';

@Injectable()
export class MfaService {
  constructor() {
    // Fail at startup, not on the first enrolment: a process that cannot
    // decrypt a secret must not accept traffic (D5).
    mfaKey();
  }

  /**
   * Starts enrolment: a fresh secret and ten recovery codes, stored encrypted
   * and unconfirmed. The plaintext exists only in this response. A second call
   * before confirmation replaces the pending factor; after confirmation it is
   * refused, because silently replacing a working second factor is how an
   * attacker with a stolen session would take an account over.
   */
  async enroll(principal: SessionPrincipal): Promise<EnrollResult> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        email: string;
        confirmed_at: Date | null;
        locked_until: Date | null;
      }>(
        'SELECT u.email, f.confirmed_at, f.locked_until FROM users u' +
          ' LEFT JOIN user_mfa_factors f ON f.user_id = u.id AND f.type = ' +
          "'totp'" +
          ' WHERE u.id = $1 AND u.deleted_at IS NULL FOR UPDATE OF u',
        [principal.userId],
      );
      const row = found.rows[0];
      if (!row) {
        throw required();
      }
      if (row.confirmed_at) {
        throw alreadyEnrolled();
      }
      // Re-enrolling must not be a way around the failure lock: the lock is on
      // the user's factor state, not on one secret. It expires on its own.
      if (row.locked_until && row.locked_until.getTime() > Date.now()) {
        throw accountLocked(secondsUntil(row.locked_until));
      }

      const secret = newTotpSecret();
      const recoveryCodes = newRecoveryCodes();
      const encrypted = await encryptSecret(client, secret);

      await client.query(
        'INSERT INTO user_mfa_factors' +
          ' (user_id, type, secret_encrypted, confirmed_at, recovery_codes_hash)' +
          " VALUES ($1, 'totp', $2, NULL, $3::text[])" +
          ' ON CONFLICT (user_id, type) DO UPDATE SET' +
          ' secret_encrypted = EXCLUDED.secret_encrypted,' +
          ' confirmed_at = NULL,' +
          ' recovery_codes_hash = EXCLUDED.recovery_codes_hash,' +
          ' last_used_time_step = NULL,' +
          ' updated_at = now()',
        [principal.userId, encrypted, recoveryCodes.map(hashRecoveryCode)],
      );
      await writeAudit(client, 'auth.mfa_enroll_started', principal.userId, {});
      await client.query('COMMIT');

      return {
        secret,
        otpauth_uri: otpauthUri(secret, row.email),
        recovery_codes: recoveryCodes,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Confirms enrolment or completes a login that stopped at MFA.
   *
   * The pending session is revoked and a new token is minted in the same
   * transaction: a caller cannot fixate the pre-MFA token and keep using it
   * after the second factor is proven (handoff risks, session fixation).
   */
  async verify(principal: SessionPrincipal, code: string): Promise<MfaVerifyResult> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<FactorRow>(
        'SELECT id, secret_encrypted, confirmed_at, failed_attempts, locked_until,' +
          ' last_used_time_step FROM user_mfa_factors' +
          " WHERE user_id = $1 AND type = 'totp' FOR UPDATE",
        [principal.userId],
      );
      const factor = found.rows[0];
      if (!factor) {
        throw mfaInvalid();
      }

      const lockedUntil = factor.locked_until;
      if (lockedUntil && lockedUntil.getTime() > Date.now()) {
        throw accountLocked(secondsUntil(lockedUntil));
      }

      const secret = await decryptSecret(client, factor.secret_encrypted);
      const lastStep =
        factor.last_used_time_step === null ? null : Number(factor.last_used_time_step);
      const check = checkTotp(secret, code, lastStep);

      if (!check.valid) {
        const attempts = factor.failed_attempts + 1;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          const until = new Date(Date.now() + LOCKOUT_MS);
          // Counter back to zero with the lock set: after the window a person
          // gets five fresh attempts instead of re-locking on the first typo.
          await client.query(
            'UPDATE user_mfa_factors' +
              ' SET failed_attempts = 0, locked_until = $2, updated_at = now()' +
              ' WHERE id = $1',
            [factor.id, until],
          );
          await writeAudit(client, 'auth.mfa_locked', principal.userId, { attempts });
          await client.query('COMMIT');
          throw accountLocked(secondsUntil(until));
        }
        await client.query(
          'UPDATE user_mfa_factors SET failed_attempts = $2, updated_at = now()' +
            ' WHERE id = $1',
          [factor.id, attempts],
        );
        await writeAudit(client, 'auth.mfa_failed', principal.userId, { attempts });
        await client.query('COMMIT');
        throw mfaInvalid();
      }

      const minted = newSessionToken();
      const idleExpiresAt = new Date(Date.now() + IDLE_TTL_MS);
      const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);
      const firstConfirmation = factor.confirmed_at === null;

      await client.query(
        'UPDATE user_mfa_factors SET' +
          ' confirmed_at = COALESCE(confirmed_at, now()),' +
          ' failed_attempts = 0, locked_until = NULL,' +
          ' last_used_time_step = $2, updated_at = now()' +
          ' WHERE id = $1',
        [factor.id, check.timeStep ?? null],
      );
      await client.query(
        'UPDATE sessions SET revoked_at = now(), updated_at = now()' +
          ' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [principal.sessionId, principal.userId],
      );
      await client.query(
        'INSERT INTO sessions' +
          ' (user_id, token_hash, kind, mfa_state, idle_expires_at, absolute_expires_at)' +
          " VALUES ($1, $2, $3, 'active', $4, $5)",
        [principal.userId, minted.hash, principal.kind, idleExpiresAt, absoluteExpiresAt],
      );
      await writeAudit(
        client,
        firstConfirmation ? 'auth.mfa_enrolled' : 'auth.mfa_verified',
        principal.userId,
        { kind: principal.kind },
      );
      await client.query('COMMIT');

      return {
        token: minted.token,
        kind: principal.kind,
        userId: principal.userId,
        expiresAt: idleExpiresAt,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * The key is a bind parameter on purpose: it must not appear in the SQL text,
 * in pg_stat_statements, or in a query error echoed by the driver.
 */
async function encryptSecret(db: DbExecutor, secret: string): Promise<Buffer> {
  const found = await db.query<{ enc: Buffer }>('SELECT pgp_sym_encrypt($1, $2) AS enc', [
    secret,
    mfaKey(),
  ]);
  return found.rows[0].enc;
}

async function decryptSecret(db: DbExecutor, encrypted: Buffer): Promise<string> {
  const found = await db.query<{ dec: string }>('SELECT pgp_sym_decrypt($1::bytea, $2) AS dec', [
    encrypted,
    mfaKey(),
  ]);
  return found.rows[0].dec;
}

function secondsUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000));
}

function mfaInvalid(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_MFA_INVALID', MFA_INVALID_MESSAGE);
}

function accountLocked(retryAfterSeconds: number): AuthHttpError {
  return new AuthHttpError(HTTP_LOCKED, 'AUTH_ACCOUNT_LOCKED', LOCKED_MESSAGE, {
    retry_after_seconds: retryAfterSeconds,
  });
}

function alreadyEnrolled(): AuthHttpError {
  return new AuthHttpError(
    HttpStatus.CONFLICT,
    'AUTH_MFA_ALREADY_ENROLLED',
    ALREADY_ENROLLED_MESSAGE,
  );
}

function required(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
}
