/**
 * Stable error envelope.
 * Contract: docs/08-api/03-contract-schemas-and-errors.md, section
 * "Standard error envelope":
 *   {"error": {code, message, details, request_id, retryable}}
 * `code` is stable and machine-readable, `details` is optional and must never
 * carry secrets, and `request_id` echoes the correlation id for support.
 */
export interface ErrorEnvelope<Code extends string = string> {
  error: {
    code: Code;
    message: string;
    details?: Record<string, unknown>;
    request_id: string;
    retryable: boolean;
  };
}

export interface ErrorOptions {
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export function buildError<Code extends string>(
  code: Code,
  message: string,
  requestId: string,
  options: ErrorOptions = {},
): ErrorEnvelope<Code> {
  const error: ErrorEnvelope<Code>['error'] = {
    code,
    message,
    request_id: requestId,
    retryable: options.retryable ?? false,
  };
  if (options.details !== undefined) {
    error.details = options.details;
  }
  return { error };
}
