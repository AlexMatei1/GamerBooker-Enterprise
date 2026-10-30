import { IDLE_TTL_MS, SESSION_COOKIE } from './auth.constants';

/**
 * One place that knows the cookie shape, because the guard refreshes it on
 * activity and the controller sets and clears it. Duplicating the attribute
 * list is how one copy silently loses HttpOnly.
 *
 * __Host- requires Secure, Path=/ and no Domain; adding Domain would make the
 * browser reject the cookie outright.
 */
export function sessionCookie(token: string): string {
  const maxAge = Math.floor(IDLE_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
