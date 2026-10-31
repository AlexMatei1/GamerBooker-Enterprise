import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthHttpError } from './auth-error';

/**
 * Fixed-window rate limiting for the auth routes.
 *
 * Policy values are constants, never read from a request and never scoped to a
 * venue: BR-024 forbids an owner disabling a platform invariant, and a per-venue
 * knob would be exactly that.
 *
 * The counter lives in this process. That is correct for the deployment that
 * exists today (one API process, no IaC, no horizontal scaling) and it is
 * recorded as a limitation: behind more than one instance the effective limit
 * multiplies by the instance count. Moving the counter to Redis or Postgres is
 * a later task, not a hidden behaviour change here.
 */

export interface RateLimitPolicy {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE = 60 * 1000;

/**
 * Failed password attempts per (address, identity). A success clears the
 * bucket, so a person who mistypes twice and then succeeds is not penalised.
 */
export const LOGIN_FAILURE_LIMIT: RateLimitPolicy = {
  name: 'login-failure',
  limit: 5,
  windowMs: 15 * MINUTE,
};

/**
 * All password attempts from one address, coarse. This is the bucket that
 * bounds spraying one password across many addresses, which the per-identity
 * bucket cannot see. Deliberately generous: shared NAT is common.
 */
export const LOGIN_ADDRESS_LIMIT: RateLimitPolicy = {
  name: 'login-address',
  limit: 300,
  windowMs: 15 * MINUTE,
};

export const REGISTER_ADDRESS_LIMIT: RateLimitPolicy = {
  name: 'register-address',
  limit: 100,
  windowMs: 60 * MINUTE,
};

export const VERIFY_ADDRESS_LIMIT: RateLimitPolicy = {
  name: 'verify-address',
  limit: 100,
  windowMs: 60 * MINUTE,
};

export const DELETE_ACCOUNT_LIMIT: RateLimitPolicy = {
  name: 'delete-account',
  limit: 10,
  windowMs: 60 * MINUTE,
};

/**
 * MFA code attempts per user. The factor lockout is the real control; this
 * bucket only bounds the work an unauthenticated-ish caller can force before
 * the lock bites, and it is keyed by the authenticated user id.
 */
export const MFA_VERIFY_LIMIT: RateLimitPolicy = {
  name: 'mfa-verify',
  limit: 10,
  windowMs: 5 * MINUTE,
};

interface Window {
  startedAt: number;
  hits: number;
}

/** Upper bound on tracked buckets, so a spray cannot grow the map without end. */
const MAX_BUCKETS = 50000;

@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  /** Refuses the call once the window is exhausted. */
  assertAllowed(policy: RateLimitPolicy, key: string): void {
    const window = this.current(policy, key);
    if (window && window.hits >= policy.limit) {
      throw rateLimited(retryAfterSeconds(policy, window));
    }
  }

  /**
   * Counts one attempt. It never throws: the refusal belongs to
   * assertAllowed() on the next call, so the attempt that reaches the limit
   * still gets its real answer (a 401 for a wrong password) instead of a 429
   * that would hide it.
   */
  record(policy: RateLimitPolicy, key: string): void {
    const bucket = bucketKey(policy, key);
    const now = Date.now();
    const window = this.current(policy, key);
    if (!window) {
      this.makeRoom(now);
      this.windows.set(bucket, { startedAt: now, hits: 1 });
      return;
    }
    window.hits += 1;
  }

  /** Forgets a bucket, for example after a successful login. */
  reset(policy: RateLimitPolicy, key: string): void {
    this.windows.delete(bucketKey(policy, key));
  }

  private current(policy: RateLimitPolicy, key: string): Window | undefined {
    const bucket = bucketKey(policy, key);
    const window = this.windows.get(bucket);
    if (!window) {
      return undefined;
    }
    if (Date.now() - window.startedAt >= policy.windowMs) {
      this.windows.delete(bucket);
      return undefined;
    }
    return window;
  }

  /** Drops expired buckets when the map grows past its bound. */
  private makeRoom(now: number): void {
    if (this.windows.size < MAX_BUCKETS) {
      return;
    }
    for (const [bucket, window] of this.windows) {
      if (now - window.startedAt >= policyWindowCeiling()) {
        this.windows.delete(bucket);
      }
    }
  }
}

/** The longest window any policy above uses; anything older is dead weight. */
function policyWindowCeiling(): number {
  return 60 * MINUTE;
}

function bucketKey(policy: RateLimitPolicy, key: string): string {
  return policy.name + '|' + key;
}

function retryAfterSeconds(policy: RateLimitPolicy, window: Window): number {
  const remainingMs = window.startedAt + policy.windowMs - Date.now();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function rateLimited(retryAfterSecondsValue: number): AuthHttpError {
  return new AuthHttpError(
    HttpStatus.TOO_MANY_REQUESTS,
    'RATE_LIMITED',
    'Too many requests; retry later.',
    { retry_after_seconds: retryAfterSecondsValue },
  );
}

/**
 * The address a bucket is keyed by. With no trust proxy configured this is the
 * peer address, which is what we want: a client cannot choose it. If a proxy is
 * ever placed in front, `trust proxy` must be set deliberately, because a
 * forged X-Forwarded-For would otherwise let a caller pick its own bucket.
 */
export function addressOf(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
