import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from './auth-error';
import type { SessionPrincipal } from './auth.service';
import { LocalAdminPolicy, type LocalAdminRequest } from './local-admin-policy';

/** Distinct from venue roles. Must follow SessionGuard, which checks cookie/MFA. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly localAdmin: LocalAdminPolicy) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LocalAdminRequest & { auth?: SessionPrincipal }>();
    const p = req.auth;
    if (!p || p.kind !== 'dashboard') throw new AuthHttpError(403, 'AUTH_ROLE_NOT_PERMITTED', 'Administrator access required.');
    const result = await getPool().query(
      `SELECT s.mfa_verified_at FROM platform_grants g JOIN sessions s ON s.user_id=g.user_id
       JOIN users u ON u.id=g.user_id
       WHERE g.user_id=$1 AND g.revoked_at IS NULL AND s.id=$2
       AND s.revoked_at IS NULL AND s.kind='dashboard' AND s.mfa_state='active'
       AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
       AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL AND u.identity_status='verified'`,
      [p.userId,p.sessionId],
    );
    if (!result.rowCount) throw new AuthHttpError(403, 'AUTH_ROLE_NOT_PERMITTED', 'Administrator access required.');
    if (!result.rows[0].mfa_verified_at && !await this.localAdmin.authorizes(req, p.sessionId, p.userId, 'cookie')) {
      throw new AuthHttpError(403, 'AUTH_ROLE_NOT_PERMITTED', 'Administrator access required.');
    }
    return true;
  }
}
