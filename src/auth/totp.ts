import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) on node:crypto, deliberately small.
 *
 * Why not a library: otplib 13.5.0 ships an ESM-only dependency tree (its CJS
 * build requires @scure/base, which is ESM). That resolves under Node 22+ via
 * require(esm) but not inside the Jest runtime, so a library here would mean
 * either a test-runner transform for node_modules or an untested auth path.
 * The algorithm is 30 lines of HMAC-SHA1 with published test vectors, and it is
 * proven against RFC 4226 and RFC 6238 vectors in tests/eng002-t04-totp.spec.ts.
 *
 * Parameters are fixed, not tunable: SHA-1, 6 digits, 30 second step. That is
 * what every authenticator app expects, and a per-user override would only
 * create a way to weaken the factor.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** One step either side absorbs clock drift without widening the replay window. */
const TOLERANCE_STEPS = 1;

export interface TotpCheck {
  valid: boolean;
  /** The step that matched, stored so the same code cannot be replayed. */
  timeStep?: number;
}

/** 20 random bytes in base32: the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid base32 character');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * HOTP (RFC 4226): HMAC-SHA1 over the counter, then dynamic truncation.
 * Exported for the test vectors; application code goes through checkTotp.
 */
export function hotp(secret: Buffer, counter: number, digits: number = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (truncated % 10 ** digits).toString().padStart(digits, '0');
}

export function timeStepAt(epochMs: number): number {
  return Math.floor(epochMs / 1000 / PERIOD_SECONDS);
}

/**
 * Verifies a code against the current step plus or minus one.
 *
 * `afterTimeStep` refuses any step at or before the last accepted one, which is
 * what makes a code single-use even while it is still inside its window.
 * Comparison is constant time; a wrong-length token is rejected before it can
 * reach timingSafeEqual, which throws on unequal lengths.
 */
export function checkTotp(
  secret: string,
  token: string,
  afterTimeStep?: number | null,
  nowMs: number = Date.now(),
): TotpCheck {
  if (!/^[0-9]{6}$/.test(token)) {
    return { valid: false };
  }
  const key = base32Decode(secret);
  const current = timeStepAt(nowMs);
  const presented = Buffer.from(token, 'utf8');
  for (let delta = -TOLERANCE_STEPS; delta <= TOLERANCE_STEPS; delta += 1) {
    const step = current + delta;
    // A clock at or before the epoch would make the counter negative, which is
    // not a valid HOTP counter. Skip it rather than throwing a 500.
    if (step < 0) {
      continue;
    }
    if (afterTimeStep !== undefined && afterTimeStep !== null && step <= afterTimeStep) {
      continue;
    }
    const expected = Buffer.from(hotp(key, step), 'utf8');
    if (timingSafeEqual(expected, presented)) {
      return { valid: true, timeStep: step };
    }
  }
  return { valid: false };
}

/** The otpauth:// URI an authenticator app scans. It carries the secret. */
export function otpauthUri(secret: string, label: string, issuer: string): string {
  const encodedLabel = encodeURIComponent(label);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return 'otpauth://totp/' + encodedLabel + '?' + params.toString();
}
