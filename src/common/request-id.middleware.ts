import { randomUUID } from 'node:crypto';
import { runWithRequestId } from './request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export function sanitizeInboundRequestId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  if (raw.length === 0 || raw.length > 128) {
    return undefined;
  }
  // The hyphen is the last character in the class, so it is literal. It must
  // stay last (or be escaped): between two characters it would form a range.
  if (!/^[A-Za-z0-9._:@+/-]+$/.test(raw)) {
    return undefined;
  }
  return raw;
}

/**
 * Correlates one HTTP request: honors a well-formed inbound X-Request-Id,
 * otherwise mints a UUID, always echoes it back on the response, and runs
 * the remaining chain inside AsyncLocalStorage so getRequestId() works
 * without threading the id through every function signature.
 */
export function requestIdMiddleware(
  req: { headers: Record<string, string | string[] | undefined>; id?: unknown },
  res: { setHeader(name: string, value: string): unknown },
  next: (err?: unknown, ...rest: unknown[]) => void,
): void {
  const inbound = sanitizeInboundRequestId(req.headers['x-request-id']);
  const requestId = inbound ?? randomUUID();
  req.id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestId(requestId, () => next());
}
