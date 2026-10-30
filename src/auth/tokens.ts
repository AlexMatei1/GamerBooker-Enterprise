import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export interface RawToken {
  /** Handed to the client once. Never stored, never logged outside dev. */
  token: string;
  /** Stored form: SHA-256 of the token, as a Buffer for a bytea column. */
  hash: Buffer;
}

/**
 * Opaque bearer/verification token: 32 random bytes in base64url
 * (43 characters, URL and cookie safe). 256 bits: not guessable.
 */
export function newSessionToken(): RawToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** Same shape as a session token, separate name so purposes cannot be mixed up. */
export function newVerificationToken(): RawToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** Only the digest is ever stored. The raw token cannot be recovered from it. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
