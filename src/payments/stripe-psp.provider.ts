import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  CreateIntentInput,
  IntentResult,
  RefundInput,
  RefundResult,
  VerifiedProviderEvent,
} from './payment-provider.interface';

/**
 * Enterprise Stripe Payment Provider.
 * Supports live Stripe API integration and cryptographic webhook signature verification (v1 HMAC-SHA256).
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.apiKey = process.env.STRIPE_SECRET_KEY || '';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('sk_'));
  }

  /**
   * Helper to compute Stripe webhook v1 signature
   * Header format: t={timestamp},v1={signature}
   */
  computeSignature(payload: string, timestamp: number, secretOverride?: string): string {
    const secret = secretOverride || this.webhookSecret;
    const signedPayload = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signedPayload).digest('hex');
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    if (!this.isConfigured) {
      throw new Error('PSP_NOT_CONFIGURED:stripe');
    }
    {
      // In live environment with STRIPE_SECRET_KEY, invoke Stripe API via standard HTTPS fetch
      try {
        const body = new URLSearchParams({
          amount: input.amountMinor.toString(),
          currency: input.currency.toLowerCase(),
          'payment_method_types[]': 'card',
          'metadata[reference]': input.reference,
          'metadata[idempotency_key]': input.idempotencyKey,
        });
        for (const [key, value] of Object.entries(input.metadata ?? {})) {
          if (/^[A-Za-z0-9_]{1,40}$/.test(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
            body.set(`metadata[${key}]`, String(value));
          }
        }

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': input.idempotencyKey,
          },
          body: body.toString(),
        });

        if (!res.ok) {
          this.logger.error(`Stripe payment_intent creation failed: ${res.status}`);
          throw new Error(`STRIPE_INTENT_ERROR: ${res.status}`);
        }

        const data = (await res.json()) as { id: string; client_secret: string; status: string };
        return {
          providerRef: data.id,
          clientSecret: data.client_secret,
          status: 'PENDING',
        };
      } catch (error) {
        this.logger.error('Error contacting Stripe API', error);
        throw error;
      }
    }
  }

  async getStatus(providerRef: string): Promise<'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'> {
    if (!this.isConfigured || !providerRef.startsWith('pi_')) {
      throw new Error('PSP_NOT_CONFIGURED:stripe');
    }
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`STRIPE_STATUS_ERROR:${res.status}`);
    const data = (await res.json()) as { status: string };
    if (data.status === 'succeeded') return 'CAPTURED';
    if (data.status === 'requires_payment_method' || data.status === 'canceled') return 'FAILED';
    return 'PENDING';
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.isConfigured || !input.providerRef.startsWith('pi_')) {
      throw new Error('PSP_NOT_CONFIGURED:stripe');
    }
    {
      try {
        const body = new URLSearchParams({
          payment_intent: input.providerRef,
          amount: input.amountMinor.toString(),
          reason: 'requested_by_customer',
        });
        const res = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': input.idempotencyKey,
          },
          body: body.toString(),
        });
        if (!res.ok) throw new Error(`STRIPE_REFUND_ERROR:${res.status}`);
        const data = (await res.json()) as { id: string; status: string };
        return {
          refundRef: data.id,
          status: data.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
        };
      } catch (err) {
        this.logger.error('Error invoking Stripe refund API:', err);
        throw err;
      }
    }
  }

  /**
   * Verifies standard Stripe signature header: t=1492774577,v1=5257a869e7ecebeda32affa...
   */
  verifyWebhook(rawBody: Buffer | string, signatureHeader: string): VerifiedProviderEvent {
    if (!this.webhookSecret) throw new Error('PSP_NOT_CONFIGURED:stripe');
    if (!signatureHeader) {
      throw new Error('PSP_SIGNATURE_MISSING');
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    // Parse Stripe signature header items
    const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, item) => {
      const [key, val] = item.trim().split('=');
      if (key && val) acc[key] = val;
      return acc;
    }, {});

    const timestamp = parseInt(parts.t || '0', 10);
    const providedSig = parts.v1;

    if (!timestamp || !providedSig) {
      throw new Error('PSP_SIGNATURE_INVALID');
    }

    const expectedSig = this.computeSignature(bodyStr, timestamp);

    const expectedBuffer = Buffer.from(expectedSig, 'utf8');
    const providedBuffer = Buffer.from(providedSig, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new Error('PSP_SIGNATURE_INVALID');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyStr) as Record<string, unknown>;
    } catch {
      throw new Error('PSP_PAYLOAD_INVALID_JSON');
    }

    const eventType = parsed.type as string;
    const dataObj = (parsed.data as { object?: Record<string, unknown> })?.object || {};

    let mappedEventType: VerifiedProviderEvent['eventType'];
    if (eventType === 'payment_intent.payment_failed') {
      mappedEventType = 'payment_intent.failed';
    } else if (eventType === 'charge.refunded') {
      mappedEventType = 'charge.refunded';
    } else if (eventType === 'payment_intent.succeeded') {
      mappedEventType = 'payment_intent.succeeded';
    } else {
      throw new Error('PSP_EVENT_UNSUPPORTED');
    }

    const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : '';
    if (!currency || typeof dataObj.id !== 'string') throw new Error('PSP_PAYLOAD_SCHEMA_INVALID');

    return {
      eventId: (parsed.id as string) || `evt_${randomUUID()}`,
      eventType: mappedEventType,
      providerRef: (dataObj.id as string) || 'unknown',
      amountMinor: Number(dataObj.amount ?? 0),
      currency: currency as 'RON',
      timestamp: new Date(Number(parsed.created || Date.now() / 1000) * 1000).toISOString(),
      payload: parsed,
    };
  }
}
