import { validationError } from './auth-error';
import type { RateLimiter, RateLimitPolicy } from './rate-limit';
import { ValidationFailure } from './validation';

/** Counts one attempt against a policy, refusing it once the window is spent. */
export function countAttempt(limiter: RateLimiter, policy: RateLimitPolicy, key: string): void {
  limiter.assertAllowed(policy, key);
  limiter.record(policy, key);
}

/** Maps a hand-rolled validation failure onto the standard envelope. */
export function parse<T>(validate: () => T): T {
  try {
    return validate();
  } catch (err) {
    if (err instanceof ValidationFailure) {
      throw validationError(err.issues);
    }
    throw err;
  }
}
