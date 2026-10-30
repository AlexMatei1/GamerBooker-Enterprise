// How the client presents a session token.
// dashboard: __Host-gb_session cookie. mobile: Authorization: Bearer <token>.
// Anything not exactly token-shaped is treated as absent, never hashed.

import { SESSION_COOKIE } from './auth.constants';

export { SESSION_COOKIE };

const BEARER_RE = /^Bearer +([A-Za-z0-9_-]+)$/;
const TOKEN_MIN = 32;
const TOKEN_MAX = 128;
const TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]+$/;

export interface AuthContext {
  sessionId: string;
  userId: string;
  kind: 'mobile' | 'dashboard';
}

export function isTokenShaped(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= TOKEN_MIN &&
    value.length <= TOKEN_MAX &&
    TOKEN_SHAPE_RE.test(value)
  );
}

/** A single-valued inbound header; an array means several values, so untrusted. */
export function singleHeaderValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

/** Reads one exact cookie from `Cookie: a=b; c=d`. No cookie parser dependency. */
export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/** Token from `Authorization: Bearer <token>`, or undefined. */
export function readBearer(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = BEARER_RE.exec(value);
  return match ? match[1] : undefined;
}
