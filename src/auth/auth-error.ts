import { HttpException, HttpStatus } from '@nestjs/common';
import type { FieldIssue } from './validation';

/**
 * A domain error carrying its HTTP status and a stable machine code.
 * The global filter reads `code` and `details` off this body, so this class is
 * the single place an auth branch chooses its envelope. Message text is fixed
 * per branch: a caller must never pass user input or a secret into it.
 */
export class AuthHttpError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, ...(details ? { details } : {}) }, status);
  }
}

export function validationError(issues: FieldIssue[]): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'The request is invalid.', {
    issues,
  });
}
