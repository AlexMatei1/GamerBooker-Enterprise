import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { getPool } from '../db/pool';
import { runWithRequestId } from '../common/request-context';
import { writeAudit } from './audit';
import type { DbExecutor } from './auth.service';
import { IDLE_TTL_MS } from './auth.constants';

export interface LocalAdminRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { localAddress?: string; remoteAddress?: string; localPort?: number };
}
const ALLOWED_ORIGINS = new Set([
  'https://127.0.0.1:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://localhost:5173',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const loopback = (address: string | undefined) => address === '127.0.0.1' || address === '::ffff:127.0.0.1';

/** One explicit development exception. No DB flag can grant its fresh proof. */
@Injectable()
export class LocalAdminPolicy implements OnModuleInit, OnModuleDestroy {
  private readonly userId: string | undefined;
  private readonly proofs = new Map<string, { userId: string; expires: number }>();
  constructor(private readonly adapter: HttpAdapterHost) {
    // Freeze configuration once; later process.env changes cannot activate it.
    if (process.env.LOCAL_ADMIN_PASSWORD_ONLY === '1' &&
        process.env.NODE_ENV === 'development' && process.env.API_HOST === '127.0.0.1' &&
        UUID.test(process.env.LOCAL_ADMIN_USER_ID ?? '')) {
      this.userId = process.env.LOCAL_ADMIN_USER_ID!.toLowerCase();
    }
  }
  async eligible(userId: string, db: DbExecutor = getPool()): Promise<boolean> {
    if (!this.userId || userId !== this.userId) return false;
    const found = await db.query(
      `SELECT 1 FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL
       AND u.email_verified_at IS NOT NULL AND u.identity_status='verified'
       AND EXISTS(SELECT 1 FROM platform_grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL)
       AND NOT EXISTS(SELECT 1 FROM venue_memberships m WHERE m.user_id=u.id AND m.active=true AND m.role<>'PLATFORM_ADMIN')`, [userId]);
    return Boolean(found.rowCount);
  }
  boundary(req: LocalAdminRequest | undefined): boolean {
    if (!this.userId || !req?.socket) return false;
    const server = this.adapter.httpAdapter?.getHttpServer();
    const address = server?.address?.() as AddressInfo | string | null | undefined;
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1' ||
        !loopback(req.socket.localAddress) || !loopback(req.socket.remoteAddress) ||
        req.socket.localPort !== address.port) return false;
    const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
    const hostOnly = (hostHeader ?? '').split(':')[0];
    if (hostOnly !== '127.0.0.1' && hostOnly !== 'localhost') return false;
    if (Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-') ||
        ['x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-client-ip', 'x-original-host'].includes(key))) return false;
    if (req.headers.authorization !== undefined) return false;
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return false;
    // Safe methods may omit Origin. Mutations must present an allowed Origin:
    // an Origin-less login is not a trusted dashboard boundary, so it must fall
    // back to the normal MFA-gated path.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '')) return true;
    return origin !== undefined && ALLOWED_ORIGINS.has(origin);
  }
  async loginAllowed(userId: string, kind: string, req: LocalAdminRequest | undefined, db: DbExecutor): Promise<boolean> {
    return kind === 'dashboard' && this.boundary(req) && await this.eligible(userId, db);
  }
  rememberFreshLogin(sessionId: string, userId: string, expiresAt: Date): void {
    if (!this.userId || userId !== this.userId) return;
    this.prune();
    while (this.proofs.size >= 128) this.proofs.delete(this.proofs.keys().next().value!);
    this.proofs.set(sessionId, { userId, expires: Math.min(expiresAt.getTime(), Date.now() + IDLE_TTL_MS) });
  }
  requiresLocalProof(session: { user_id: string; kind: string; mfa_state: string; mfa_verified_at: Date | null }): boolean {
    return Boolean(this.userId && session.user_id === this.userId && session.kind === 'dashboard' &&
      session.mfa_state === 'active' && !session.mfa_verified_at);
  }
  async authorizes(req: LocalAdminRequest | undefined, sessionId: string, userId: string, channel: string): Promise<boolean> {
    this.prune();
    const proof = this.proofs.get(sessionId);
    if (channel !== 'cookie' || !proof || proof.userId !== userId || !this.boundary(req)) return false;
    if (!await this.eligible(userId)) { this.proofs.delete(sessionId); return false; }
    return true;
  }
  private prune() {
    for (const [id, proof] of this.proofs) if (proof.expires <= Date.now()) this.proofs.delete(id);
  }
  onModuleDestroy() { this.proofs.clear(); }
  async onModuleInit() {
    if (!this.userId) return;
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [this.userId]);
      if (!await this.eligible(this.userId, client)) throw new Error('LOCAL_ADMIN_MODE_IDENTITY_NOT_ELIGIBLE');
      const revoked = await client.query('UPDATE sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [this.userId]);
      await runWithRequestId('local-admin-mode-' + randomUUID(), () => writeAudit(client,
        'auth.local_admin_mode_activated', null, { revoked_sessions: revoked.rowCount, mode: 'loopback_password_only' },
        { targetId: this.userId, targetType: 'USER', actorRole: 'LOCAL_RUNTIME' }));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
