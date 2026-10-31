import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import type { Response } from 'express';
import { getPool } from '../db/pool';
import { AuthHttpError } from './auth-error';
import { IDLE_TTL_MS, SESSION_COOKIE } from './auth.constants';
import { sessionCookie } from './cookies';
import { MFA_GATED_ROLES } from './membership.service';
import { hashToken } from './tokens';
import {
  isTokenShaped,
  readBearer,
  readCookie,
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
  mfa_state: 'pending' | 'active';
  /** True when the user currently holds an active membership in a gated role. */
  mfa_gated: boolean;
  /** True when a confirmed TOTP factor exists. */
  mfa_enrolled: boolean;
}

const REQUIRED_MESSAGE = 'Authentication is required.';
const MFA_REQUIRED_MESSAGE = 'Two-factor authentication must be completed first.';

/**
 * Marks the only handlers a pending-MFA session may reach (D10).
 *
 * Opt-in on purpose: a new route is closed to a pending session until someone
 * says otherwise, so forgetting the metadata fails safe.
 */
export const MFA_PENDING_KEY = 'auth:mfa-pending-allowed';

export function AllowPendingMfa(): MethodDecorator {
  return SetMetadata(MFA_PENDING_KEY, true);
}

/** How the token arrived. A dashboard token is only accepted as a cookie. */
type Channel = 'cookie' | 'bearer';

interface Presented {
  token: string;
  channel: Channel;
}

/**
 * Resolves the caller from an opaque session token: the __Host- cookie for the
 * dashboard, or Authorization: Bearer for mobile. Both hit the same sessions
 * row, so revocation is identical for both clients.
 *
 * Nothing from the request is trusted except the token itself. The user id,
 * the role and the venue are never read from a header or a body.
 *
 * Idle expiry is sliding: an accepted request moves idle_expires_at forward,
 * bounded by the absolute expiry, and the cookie Max-Age is refreshed to match.
 * Without the extension the column would be a fixed 12h window from mint while
 * claiming to be idle-based.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestLike>();
    const presented = extractToken(req);
    if (!presented) {
      throw required();
    }

    const found = await getPool().query<SessionRow>(
      'SELECT s.id, s.user_id, s.kind, s.mfa_state,' +
        ' EXISTS (SELECT 1 FROM venue_memberships m' +
        '   WHERE m.user_id = s.user_id AND m.active = true AND m.role = ANY($2::text[]))' +
        '   AS mfa_gated,' +
        ' EXISTS (SELECT 1 FROM user_mfa_factors f' +
        "   WHERE f.user_id = s.user_id AND f.type = 'totp' AND f.confirmed_at IS NOT NULL)" +
        '   AS mfa_enrolled' +
        ' FROM sessions s' +
        ' JOIN users u ON u.id = s.user_id' +
        ' WHERE s.token_hash = $1' +
        ' AND s.revoked_at IS NULL' +
        ' AND s.idle_expires_at > now()' +
        ' AND s.absolute_expires_at > now()' +
        ' AND u.deleted_at IS NULL',
      [hashToken(presented.token), MFA_GATED_ROLES],
    );

    const row = found.rows[0];
    if (!row) {
      throw required();
    }

    // A dashboard token is issued to a browser inside an HttpOnly cookie. If it
    // is presented as a bearer it is being used outside the shape it was issued
    // for, so it is refused rather than widening the credential surface. The
    // inverse is refused for the same reason: a mobile token placed in the
    // dashboard cookie must not silently become a cookie session.
    if (row.kind === 'dashboard' && presented.channel === 'bearer') {
      throw required();
    }
    if (row.kind === 'mobile' && presented.channel === 'cookie') {
      throw required();
    }

    // A session that stopped at the second factor may only finish that step.
    // The gate is evaluated per request, not only at login: a membership granted
    // mid-session (or a factor deleted out from under an active session) must not
    // leave an unverified session with privileged reach. The check runs before
    // the handler and before the idle touch.
    const gated = row.mfa_state === 'pending' || (row.mfa_gated && !row.mfa_enrolled);
    if (gated && Reflect.getMetadata(MFA_PENDING_KEY, context.getHandler()) !== true) {
      throw mfaRequired();
    }

    req.auth = {
      sessionId: row.id,
      userId: row.user_id,
      kind: row.kind,
      mfaState: row.mfa_state,
    };

    await this.touch(http.getResponse<Response>(), row, presented);
    return true;
  }

  /**
   * Extends the idle window and refreshes the cookie. A failure here must not
   * fail an already-authorized request, but it is logged with the session id
   * and a SQLSTATE only: silently swallowing it would hide a database problem
   * while sessions quietly stopped sliding.
   */
  private async touch(res: Response, row: SessionRow, presented: Presented): Promise<void> {
    try {
      await getPool().query(
        'UPDATE sessions' +
          ' SET last_seen_at = now(),' +
          " idle_expires_at = LEAST(now() + $2::bigint * interval '1 millisecond', absolute_expires_at)," +
          ' updated_at = now()' +
          ' WHERE id = $1 AND revoked_at IS NULL',
        [row.id, IDLE_TTL_MS],
      );
      if (presented.channel === 'cookie') {
        res.setHeader('Set-Cookie', sessionCookie(presented.token));
      }
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'unknown';
      this.logger.warn('session touch failed session_id=' + row.id + ' sqlstate=' + code);
    }
  }
}

function extractToken(req: RequestLike): Presented | undefined {
  const cookieHeader = singleHeaderValue(req.headers.cookie);
  if (cookieHeader) {
    const fromCookie = readCookie(cookieHeader, SESSION_COOKIE);
    if (fromCookie !== undefined) {
      return isTokenShaped(fromCookie) ? { token: fromCookie, channel: 'cookie' } : undefined;
    }
  }
  const bearer = readBearer(singleHeaderValue(req.headers.authorization));
  if (bearer !== undefined && isTokenShaped(bearer)) {
    return { token: bearer, channel: 'bearer' };
  }
  return undefined;
}

function required(): AuthHttpError {
  return new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', REQUIRED_MESSAGE);
}

function mfaRequired(): AuthHttpError {
  return new AuthHttpError(HttpStatus.FORBIDDEN, 'AUTH_MFA_REQUIRED', MFA_REQUIRED_MESSAGE);
}
