// ENG-001 / T-002: request-id correlation and the stable error envelope.
// Level: unit. No network, no database, no timers.
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  sanitizeInboundRequestId,
} from '../src/common/request-id.middleware';
import { getRequestId } from '../src/common/request-context';
import { buildError } from '../src/common/error-envelope';
import { parseDatabaseTarget } from '../src/health/health.controller';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface FakeRequest {
  headers: Record<string, string | string[] | undefined>;
  id?: unknown;
}

interface FakeResponse {
  readonly headers: Map<string, string>;
  setHeader(name: string, value: string): void;
}

function makeRequest(headers: Record<string, string | string[] | undefined> = {}): FakeRequest {
  return { headers };
}

function makeResponse(): FakeResponse {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader(name: string, value: string): void {
      headers.set(name, value);
    },
  };
}

describe('ENG001-T02 sanitizeInboundRequestId', () => {
  it('accepts a well-formed inbound id', () => {
    expect(sanitizeInboundRequestId('probe-abc-123')).toBe('probe-abc-123');
  });

  it('accepts every allowed punctuation character', () => {
    const value = 'a.b_c:d@e+f/g-h';
    expect(sanitizeInboundRequestId(value)).toBe(value);
  });

  it('accepts exactly 128 characters and rejects 129', () => {
    expect(sanitizeInboundRequestId('a'.repeat(128))).toBe('a'.repeat(128));
    expect(sanitizeInboundRequestId('a'.repeat(129))).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(sanitizeInboundRequestId('')).toBeUndefined();
  });

  it('rejects whitespace', () => {
    expect(sanitizeInboundRequestId('bad value with spaces')).toBeUndefined();
  });

  it('rejects a comma', () => {
    // Regression guard: the trailing hyphen in the accept-list must stay literal.
    expect(sanitizeInboundRequestId('abc,def')).toBeUndefined();
  });

  it('rejects CR and LF (header injection)', () => {
    expect(sanitizeInboundRequestId('abc\ndef')).toBeUndefined();
    expect(sanitizeInboundRequestId('abc\rdef')).toBeUndefined();
  });

  it('rejects non-string values', () => {
    expect(sanitizeInboundRequestId(undefined)).toBeUndefined();
    expect(sanitizeInboundRequestId(null)).toBeUndefined();
    expect(sanitizeInboundRequestId(123)).toBeUndefined();
    expect(sanitizeInboundRequestId({})).toBeUndefined();
    expect(sanitizeInboundRequestId(['abc'])).toBeUndefined();
  });
});

describe('ENG001-T02 requestIdMiddleware', () => {
  it('echoes a safe inbound id and exposes it on req.id', () => {
    const req = makeRequest({ 'x-request-id': 'probe-abc-123' });
    const res = makeResponse();
    requestIdMiddleware(req, res, () => undefined);

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('probe-abc-123');
    expect(req.id).toBe('probe-abc-123');
  });

  it('mints a UUID when the header is absent', () => {
    const req = makeRequest();
    const res = makeResponse();
    requestIdMiddleware(req, res, () => undefined);

    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).toBeDefined();
    expect(UUID_V4.test(echoed as string)).toBe(true);
    expect(req.id).toBe(echoed);
  });

  it('mints a UUID when the inbound id is unsafe', () => {
    const req = makeRequest({ 'x-request-id': 'bad value with spaces' });
    const res = makeResponse();
    requestIdMiddleware(req, res, () => undefined);

    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).not.toBe('bad value with spaces');
    expect(UUID_V4.test(echoed as string)).toBe(true);
  });

  it('ignores an array-valued header and mints a UUID', () => {
    // Node joins duplicate headers into one string, so an array here means an
    // unusual client. Fail closed: never trust an ambiguous inbound id.
    const req = makeRequest({ 'x-request-id': ['first-id', 'second-id'] });
    const res = makeResponse();
    requestIdMiddleware(req, res, () => undefined);

    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).not.toBe('first-id');
    expect(UUID_V4.test(echoed as string)).toBe(true);
    expect(req.id).toBe(echoed);
  });

  it('exposes the id through AsyncLocalStorage inside the chain', () => {
    const req = makeRequest({ 'x-request-id': 'ctx-visible' });
    const res = makeResponse();
    let seenInside: string | undefined;
    requestIdMiddleware(req, res, () => {
      seenInside = getRequestId();
    });

    expect(seenInside).toBe('ctx-visible');
  });

  it('keeps the store across an await inside the chain', async () => {
    const req = makeRequest({ 'x-request-id': 'ctx-async' });
    const res = makeResponse();

    const seen = await new Promise<string | undefined>((resolve) => {
      requestIdMiddleware(req, res, () => {
        void (async () => {
          await Promise.resolve();
          resolve(getRequestId());
        })();
      });
    });

    expect(seen).toBe('ctx-async');
  });

  it('returns undefined outside a request', () => {
    expect(getRequestId()).toBeUndefined();
  });
});

describe('ENG001-T02 buildError', () => {
  it('produces the documented envelope shape', () => {
    const envelope = buildError('AUTH_REQUIRED', 'Authentication required.', 'req-1');
    expect(Object.keys(envelope.error).sort()).toEqual(
      ['code', 'message', 'request_id', 'retryable'].sort(),
    );
    expect(envelope.error.code).toBe('AUTH_REQUIRED');
    expect(envelope.error.message).toBe('Authentication required.');
    expect(envelope.error.request_id).toBe('req-1');
  });

  it('defaults retryable to false', () => {
    expect(buildError('FORBIDDEN', 'nope', 'req-2').error.retryable).toBe(false);
  });

  it('honours retryable when passed', () => {
    expect(buildError('READY_DB_UNAVAILABLE', 'down', 'req-3', { retryable: true }).error.retryable).toBe(
      true,
    );
  });

  it('omits details when not provided', () => {
    expect('details' in buildError('FORBIDDEN', 'nope', 'req-4').error).toBe(false);
  });

  it('includes details when provided', () => {
    const envelope = buildError('VALIDATION_ERROR', 'bad', 'req-5', {
      details: { field: 'email' },
    });
    expect(envelope.error.details).toEqual({ field: 'email' });
  });
});

describe('ENG001-T02 parseDatabaseTarget', () => {
  it('parses host and port from a postgresql DSN', () => {
    expect(parseDatabaseTarget('postgresql://postgres@127.0.0.1:5433/gamerbooker_dev')).toEqual({
      host: '127.0.0.1',
      port: 5433,
    });
  });

  it('accepts the postgres scheme', () => {
    expect(parseDatabaseTarget('postgres://user@db.internal:5432/app')).toEqual({
      host: 'db.internal',
      port: 5432,
    });
  });

  it('defaults the port to 5432 when absent', () => {
    expect(parseDatabaseTarget('postgresql://localhost/app')).toEqual({
      host: 'localhost',
      port: 5432,
    });
  });

  it('rejects a missing or empty value', () => {
    expect(parseDatabaseTarget(undefined)).toBeUndefined();
    expect(parseDatabaseTarget('')).toBeUndefined();
  });

  it('rejects a malformed DSN', () => {
    expect(parseDatabaseTarget('not-a-valid-dsn')).toBeUndefined();
  });

  it('rejects a non-postgres protocol', () => {
    expect(parseDatabaseTarget('mysql://localhost:3306/app')).toBeUndefined();
  });

  it('rejects an out-of-range port', () => {
    expect(parseDatabaseTarget('postgresql://localhost:70000/app')).toBeUndefined();
  });
});
