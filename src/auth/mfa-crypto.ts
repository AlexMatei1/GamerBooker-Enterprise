import { createHash, randomBytes } from 'node:crypto';
import {
  checkTotp as checkTotpRaw,
  generateTotpSecret,
  otpauthUri as buildOtpauthUri,
  type TotpCheck,
} from './totp';

/**
 * TOTP policy constants, the at-rest key for the shared secret, and recovery
 * codes.
 *
 * The secret is encrypted by pgcrypto inside the database, not in this process:
 * D5 chose pgcrypto with a key from the environment. The key is always a bind
 * parameter, so it never appears in SQL text, in an error message or in the
 * application log. It does mean the server must not run with log_statement=all
 * (recorded in notes/eng-002-slice-b-part-2-plan.md).
 */

const KEY_ENV = 'MFA_SECRET_KEY';
const KEY_MIN_LENGTH = 32;

/** Google Authenticator compatible: 6 digits, 30 second step, SHA-1. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** One step either side, which absorbs clock drift without widening replay. */
export const TOTP_TOLERANCE_SECONDS = 30;

export const RECOVERY_CODE_COUNT = 10;

export const MFA_ISSUER = 'GamerBooker';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * The key must exist and be long enough to be a key rather than a password.
 * Throwing at startup is deliberate: a server that can encrypt a secret but not
 * decrypt it, or one that silently falls back to a default, is worse than a
 * server that refuses to boot.
 */
export function mfaKey(): string {
  const key = process.env[KEY_ENV];
  if (!key || key.length < KEY_MIN_LENGTH) {
    throw new Error(KEY_ENV + ' must be set to at least ' + KEY_MIN_LENGTH + ' characters');
  }
  return key;
}

/** 20 random bytes in base32, the size RFC 4226 recommends for HMAC-SHA1. */
export function newTotpSecret(): string {
  return generateTotpSecret();
}

/** The otpauth:// URI an authenticator app scans. Carries the secret. */
export function otpauthUri(secret: string, label: string): string {
  return buildOtpauthUri(secret, label, MFA_ISSUER);
}

/**
 * Verifies a code. `afterTimeStep` rejects a code whose step is not strictly
 * newer than the last accepted one, which is what makes a code single-use even
 * while it is still inside its window (D12).
 */
export function checkTotp(
  secret: string,
  token: string,
  afterTimeStep?: number | null,
): TotpCheck {
  return checkTotpRaw(secret, token, afterTimeStep);
}

/**
 * Recovery codes are shown once, at enrolment. Only the digest is stored, in a
 * form that ignores case and dashes so a person can retype one.
 */
export function newRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(5).toString('hex');
    codes.push(raw.slice(0, 5) + '-' + raw.slice(5));
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const canonical = code.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
