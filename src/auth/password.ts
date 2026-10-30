import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

// OWASP baseline for Argon2id: m=19456 KiB (19 MiB), t=2, p=1.
const PARAMS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const DUMMY_PASSWORD = 'dummy-password-never-matches';

// Computed once per process. Never persisted, never logged. It exists only so
// that an unknown user and a known user pay the same Argon2id cost.
let dummyHash: Promise<string> | undefined;

export async function hash(password: string): Promise<string> {
  return argonHash(password, PARAMS);
}

/**
 * Argon2id verification. A malformed or unrecognised stored hash is a
 * verification miss (false), not a 500: the store's shape must not leak.
 */
export async function verify(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Runs one full Argon2id verification against a fixed hash and always returns
 * false. Unknown-user login calls this so timing does not reveal whether the
 * email exists (ENG002-T05).
 */
export async function verifyDummy(): Promise<boolean> {
  if (!dummyHash) {
    dummyHash = argonHash(DUMMY_PASSWORD, PARAMS);
  }
  const stored = await dummyHash;
  await verify(stored, DUMMY_PASSWORD + '-attempt');
  return false;
}
