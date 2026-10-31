export interface CreateIntentInput {
  amountMinor: number;
  currency: 'RON';
  reference: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface IntentResult {
  providerRef: string;
  clientSecret?: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
}

export interface RefundInput {
  providerRef: string;
  amountMinor: number;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundResult {
  refundRef: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
}

export interface VerifiedProviderEvent {
  eventId: string;
  eventType: 'payment_intent.succeeded' | 'payment_intent.failed' | 'charge.refunded';
  providerRef: string;
  amountMinor: number;
  currency: 'RON';
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  getStatus(providerRef: string): Promise<'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifyWebhook(rawBody: Buffer | string, signatureHeader: string): VerifiedProviderEvent;
}
