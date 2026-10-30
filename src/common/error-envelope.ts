/**
 * Stable error envelope.
 * Contract: docs/08-api/03-contract-schemas-and-errors.md, section
 * "Standard error envelope" — {"error": {code, message, ...}} with a
 * stable machine-readable code and the request id echoed for correlation.
 */
export interface ErrorEnvelope<Code extends string = string> {
  error: {
    code: Code;
    message: string;
    request_id: string;
  };
}

export function buildError<Code extends string>(
  code: Code,
  message: string,
  requestId: string,
): ErrorEnvelope<Code> {
  return { error: { code, message, request_id: requestId } };
}
