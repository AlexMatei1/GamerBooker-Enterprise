import { getRequestId } from '../common/request-context';
import type { DbExecutor } from './auth.service';

/**
 * Append-only audit row, written inside the caller's transaction so a failed
 * business change cannot leave an orphan audit entry.
 *
 * request_id is NOT NULL in the schema and is the only way to tie a row to the
 * request that caused it, so a caller outside a request context throws instead
 * of writing a row nobody can correlate. Metadata must never carry an email,
 * phone, password, token, TOTP secret or TOTP code: callers pass counts and
 * closed-set codes only.
 */
export async function writeAudit(
  db: DbExecutor,
  action: string,
  actorId: string | null,
  metadata: Record<string, unknown>,
  scope: { tenantId?: string | null; venueId?: string | null; targetId?: string; targetType?: string; actorRole?: string } = {},
): Promise<void> {
  const requestId = getRequestId();
  if (!requestId) {
    throw new Error('audit write outside a request context: no request id');
  }
  await db.query(
    'INSERT INTO audit_events (actor_id, action, metadata, request_id,tenant_id,venue_id,target_id,target_type,actor_role)' +
      ' VALUES ($1, $2, $3::jsonb, $4,$5,$6,$7,$8,$9)',
    [actorId, action, JSON.stringify(metadata), requestId,scope.tenantId??null,scope.venueId??null,scope.targetId??null,scope.targetType??null,scope.actorRole??null],
  );
}
