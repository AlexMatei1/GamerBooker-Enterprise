import { randomUUID } from 'node:crypto';
import { SandboxPaymentProvider } from './sandbox-psp.provider';

export interface SimulatedWebhookPayload {
  event_id: string;
  event_type: 'payment_intent.succeeded' | 'payment_intent.failed' | 'charge.refunded';
  provider_ref: string;
  amount_minor: number;
  currency: 'RON';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class WebhookReplayHarness {
  constructor(private readonly provider: SandboxPaymentProvider) {}

  createEvent(
    providerRef: string,
    eventType: 'payment_intent.succeeded' | 'payment_intent.failed' | 'charge.refunded',
    amountMinor: number,
    eventId: string = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
  ): { payload: SimulatedWebhookPayload; rawBody: string; signature: string } {
    const payload: SimulatedWebhookPayload = {
      event_id: eventId,
      event_type: eventType,
      provider_ref: providerRef,
      amount_minor: amountMinor,
      currency: 'RON',
      timestamp: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const signature = this.provider.signPayload(rawBody);

    return { payload, rawBody, signature };
  }
}
