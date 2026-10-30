import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated through the async call graph.
 *
 * Bare callbacks (setTimeout, event emitters) lose the store; code on the
 * request chain — which awaits or returns `next()` — keeps it.
 */
export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/**
 * Returns the request id of the current async context, or undefined when
 * called outside a request (bootstrap, tests, background work).
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
