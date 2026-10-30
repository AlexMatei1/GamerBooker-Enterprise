import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { buildError } from './error-envelope';
import { getRequestId } from './request-context';
import { REQUEST_ID_HEADER } from './request-id.middleware';

interface MappedError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ExceptionBody {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

const GENERIC_500 = 'Internal server error.';

const BY_STATUS: Record<number, MappedError> = {
  [HttpStatus.BAD_REQUEST]: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
  [HttpStatus.UNAUTHORIZED]: { code: 'AUTH_REQUIRED', message: 'Authentication is required.' },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: 'You do not have access to this resource.',
  },
  [HttpStatus.NOT_FOUND]: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: 'RATE_LIMITED', message: 'Too many requests; retry later.' },
};

/**
 * Last line of defence for the documented error envelope
 * (docs/08-api/03-contract-schemas-and-errors.md, "Standard error envelope").
 * Any throw that reaches Nest lands here as
 * {error:{code,message,details?,request_id,retryable}}.
 *
 * 5xx never forwards the original text or details: they may carry SQL, a DSN,
 * a stack or a secret. 4xx forwards a handler's own `code`/`details` because
 * that is the branch the contract names.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = resolveRequestId(res);
    const status = statusOf(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Category only. The thrown text is untrusted.
      this.logger.error('unhandled error status=' + status + ' request_id=' + requestId);
    }

    const mapped = mappingFor(status, exception);

    res.status(status).json(
      buildError(mapped.code, mapped.message, requestId, {
        retryable: status === HttpStatus.TOO_MANY_REQUESTS || status >= 500,
        ...(mapped.details !== undefined ? { details: mapped.details } : {}),
      }),
    );
  }
}

export function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

export function mappingFor(status: number, exception: unknown): MappedError {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return { code: 'INTERNAL_ERROR', message: GENERIC_500 };
  }
  const body = bodyOf(exception);
  if (body && typeof body.code === 'string' && body.code.length > 0) {
    const mapped: MappedError = {
      code: body.code,
      message: messageOf(body, status),
    };
    if (body.details && typeof body.details === 'object' && !Array.isArray(body.details)) {
      mapped.details = body.details as Record<string, unknown>;
    }
    return mapped;
  }
  const fallback = BY_STATUS[status];
  return fallback ? { ...fallback } : { code: 'VALIDATION_ERROR', message: 'The request is invalid.' };
}

function bodyOf(exception: unknown): ExceptionBody | undefined {
  if (!(exception instanceof HttpException)) {
    return undefined;
  }
  const payload = exception.getResponse();
  if (typeof payload === 'string') {
    return { message: payload };
  }
  if (payload && typeof payload === 'object') {
    return payload as ExceptionBody;
  }
  return undefined;
}

/** A handler's own message, keeping multi-field validation detail. */
function messageOf(body: ExceptionBody, status: number): string {
  const message = body.message;
  if (Array.isArray(message)) {
    return message.length > 0 ? message.map(String).join('; ') : defaultMessage(status);
  }
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  return defaultMessage(status);
}

function defaultMessage(status: number): string {
  if (status >= 500) {
    return GENERIC_500;
  }
  return BY_STATUS[status]?.message ?? 'The request is invalid.';
}

/**
 * The request id for this response, never empty: AsyncLocalStorage first, then
 * the X-Request-Id the middleware already wrote, then a freshly minted UUID
 * which is echoed back so the envelope and the header cannot disagree.
 */
export function resolveRequestId(res: Response): string {
  const fromStore = getRequestId();
  if (fromStore) {
    return fromStore;
  }
  const fromHeader = res.getHeader(REQUEST_ID_HEADER);
  if (typeof fromHeader === 'string' && fromHeader.length > 0) {
    return fromHeader;
  }
  const minted = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, minted);
  return minted;
}
