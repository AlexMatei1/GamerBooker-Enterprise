import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  CreateIntentInput,
  IntentResult,
  RefundInput,
  RefundResult,
  VerifiedProviderEvent,
} from './payment-provider.interface';

export const DEFAULT_SANDBOX_SECRET = 'sandbox-webhook-secret-0123456789abcdef';

@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';
  private readonly secret: string;

  constructor() {
    this.secret = process.env.PSP_WEBHOOK_SECRET || DEFAULT_SANDBOX_SECRET;
  }

  /**
   * Helper for sandbox & test replay harness to generate a valid HMAC signature.
   */
  signPayload(payload: Buffer | string, secretOverride?: string): string {
    const key = secretOverride || this.secret;
    const bodyStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    return createHmac('sha256', key).update(bodyStr).digest('hex');
  }

  async createIntent(_input: CreateIntentInput): Promise<IntentResult> {
    const providerRef = `sbx_pi_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return {
      providerRef,
      clientSecret: `sbx_secret_${randomUUID()}`,
      status: 'PENDING',
    };
  }

  async getStatus(_providerRef: string): Promise<'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'> {
    return 'CAPTURED';
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return {
      refundRef: `sbx_re_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      status: 'SUCCEEDED',
    };
  }

  verifyWebhook(rawBody: Buffer | string, signatureHeader: string): VerifiedProviderEvent {
    if (!signatureHeader) {
      throw new Error('PSP_SIGNATURE_MISSING');
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSig = this.signPayload(bodyBuffer);

    // Constant-time comparison to prevent timing attacks
    const expectedSigBuffer = Buffer.from(expectedSig, 'utf8');
    const providedSigBuffer = Buffer.from(signatureHeader.trim(), 'utf8');

    if (
      expectedSigBuffer.length !== providedSigBuffer.length ||
      !timingSafeEqual(expectedSigBuffer, providedSigBuffer)
    ) {
      throw new Error('PSP_SIGNATURE_INVALID');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyBuffer.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('PSP_PAYLOAD_INVALID_JSON');
    }

    if (!parsed.event_id || !parsed.event_type || !parsed.provider_ref) {
      throw new Error('PSP_PAYLOAD_SCHEMA_INVALID');
    }

    return {
      eventId: String(parsed.event_id),
      eventType: parsed.event_type as VerifiedProviderEvent['eventType'],
      providerRef: String(parsed.provider_ref),
      amountMinor: Number(parsed.amount_minor ?? 0),
      currency: 'RON',
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
      payload: parsed,
    };
  }
}
