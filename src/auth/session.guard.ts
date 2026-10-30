import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from './auth-error';
import { hashToken } from './tokens';
import {
  isTokenShaped,
  readBearer,
  readCookie,
  SESSION_COOKIE,
  singleHeaderValue,
  type AuthContext,
} from './token-shape';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}

interface SessionRow {
  id: string;
  user_id: string;
  kind: 'mobile' | 'dashboard';
}

const REQUIRED_MESSAGE = 'Authentication is required.';

/**
 * Resolves the caller from an opaque session token: the __Host- cookie for the
 * dashboard, or Authorization: Bearer for mobile. Both hit the same sessions
 * row, so revocation is identical for both clients.
 *
 * Nothing from the request is trusted except the token itself. The user id,
 * the role and the venue are never read from a header or a body.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = extractToken(req);
    if (!token) {
      throw required();
    }

    const found = await getPool().query<SessionRow>(
      'SELECT s.id, s.user_id, s.kind FROM sessions s' +
        ' JOIN users u ON u.id = s.user_id' +
        ' WHERE s.token_hash = $1' +
        ' AND s.revoked_at IS NULL' +
        ' AND s.idle_expires_at > now()' +
        ' AND s.absolute_expires_at > now()' +
        ' AND u.deleted_at IS NULL',
      [hashToken(token)],
    );

    const row = found.rows[0];
    if (!row) {
      throw required();
    }

    req.auth = { sessionId: row.id, userId: row.user_id, kind: row.kind };

    // Best effort: a failed touch must not fail an otherwise valid request.
    try {
      void getPool()
        .query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id])
        .catch(() => undefined);
    } catch {
      // Pool unavailable; the request is already authorized.
    }

    return true;
  }
}

function extractToken(req: RequestLike): string | undefined {
  const cookieHeader = singleHeaderValue(req.headers.cookie);
  if (cookieHeader) {
    const fromCookie = readCookie(cookieHeader, SESSION_COOKIE);
    if (fromCookie !== undefined) {
      return isTokenShaped(fromCookie) ? fromCookie : undefined;
    }
  }
  const bearer = readBearer(singleHeaderValue(req.headers.authorization));
  return bearer !== undefined && isTokenShaped(bearer) ? bearer : undefined;
}

function required(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
}
