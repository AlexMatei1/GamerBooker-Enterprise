import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { SandboxPaymentProvider } from './sandbox-psp.provider';
import type {
  PaymentProvider,
  CreateIntentInput,
  IntentResult,
  RefundInput,
  RefundResult,
  VerifiedProviderEvent,
} from './payment-provider.interface';

export interface PaymentIntentRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  booking_id: string | null;
  order_id: string | null;
  group_booking_id?: string | null;
  group_participant_id?: string | null;
  provider: string;
  provider_ref: string;
  idempotency_key: string;
  amount_minor: string;
  currency: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookProcessResult {
  eventId: string;
  duplicate: boolean;
  status: 'PROCESSED' | 'IGNORED' | 'FAILED';
  eventType: string;
  providerRef: string;
}

@Injectable()
export class PaymentsService {
  private readonly providers: Map<string, PaymentProvider> = new Map();
  private readonly paymentCaptureHandlers: Array<(intent: PaymentIntentRow) => Promise<void>> = [];

  constructor(private readonly sandboxProvider: SandboxPaymentProvider) {
    this.registerProvider(sandboxProvider);
  }

  onPaymentCaptured(handler: (intent: PaymentIntentRow) => Promise<void>): void {
    this.paymentCaptureHandlers.push(handler);
  }

  registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): PaymentProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'PSP_PROVIDER_NOT_SUPPORTED',
        `Payment provider '${name}' is not supported.`,
      );
    }
    return p;
  }

  async createIntent(
    tenantId: string,
    venueId: string,
    input: CreateIntentInput,
    providerName: string = 'sandbox',
    groupBookingId?: string | null,
    groupParticipantId?: string | null,
  ): Promise<IntentResult & { intentId: string }> {
    const provider = this.getProvider(providerName);
    const pool = getPool();

    // Check idempotency key first
    const existing = await pool.query<PaymentIntentRow>(
      'SELECT * FROM payment_intents WHERE idempotency_key = $1',
      [input.idempotencyKey],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        intentId: row.id,
        providerRef: row.provider_ref,
        status: row.status,
      };
    }

    const providerResult = await provider.createIntent(input);

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO payment_intents
        (tenant_id, venue_id, provider, provider_ref, idempotency_key, amount_minor, currency, status, metadata, group_booking_id, group_participant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        venueId,
        providerName,
        providerResult.providerRef,
        input.idempotencyKey,
        input.amountMinor,
        input.currency,
        providerResult.status,
        JSON.stringify(input.metadata ?? {}),
        groupBookingId || null,
        groupParticipantId || null,
      ],
    );

    return {
      ...providerResult,
      intentId: inserted.rows[0].id,
    };
  }

  async refund(
    input: RefundInput,
    providerName: string = 'sandbox',
  ): Promise<RefundResult> {
    const provider = this.getProvider(providerName);
    return provider.refund(input);
  }

  async getIntent(providerRef: string): Promise<PaymentIntentRow | null> {
    const pool = getPool();
    const res = await pool.query<PaymentIntentRow>(
      'SELECT * FROM payment_intents WHERE provider_ref = $1',
      [providerRef],
    );
    return res.rows[0] ?? null;
  }

  async processWebhook(
    providerName: string,
    rawBody: Buffer | string,
    signatureHeader: string,
  ): Promise<WebhookProcessResult> {
    const provider = this.getProvider(providerName);
    let event: VerifiedProviderEvent;

    try {
      event = provider.verifyWebhook(rawBody, signatureHeader);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PSP_SIGNATURE_INVALID';
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        msg.startsWith('PSP_') ? msg : 'PSP_SIGNATURE_INVALID',
        'Webhook signature or payload verification failed.',
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check if event was already recorded (idempotency check)
      const existing = await client.query<{ status: string }>(
        'SELECT status FROM payment_webhook_events WHERE provider = $1 AND event_id = $2 FOR UPDATE',
        [providerName, event.eventId],
      );

      if (existing.rows.length > 0) {
        // Event has already been received and processed
        await client.query('COMMIT');
        return {
          eventId: event.eventId,
          duplicate: true,
          status: 'IGNORED',
          eventType: event.eventType,
          providerRef: event.providerRef,
        };
      }

      // 2. Insert into payment_webhook_events
      await client.query(
        `INSERT INTO payment_webhook_events
          (provider, event_id, event_type, provider_ref, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          providerName,
          event.eventId,
          event.eventType,
          event.providerRef,
          JSON.stringify(event.payload),
          'PROCESSED',
        ],
      );

      // 3. Map event to payment_intent state change
      let targetStatus: 'CAPTURED' | 'FAILED' | 'REFUNDED' | null = null;
      if (event.eventType === 'payment_intent.succeeded') {
        targetStatus = 'CAPTURED';
      } else if (event.eventType === 'payment_intent.failed') {
        targetStatus = 'FAILED';
      } else if (event.eventType === 'charge.refunded') {
        targetStatus = 'REFUNDED';
      }

      if (targetStatus) {
        await client.query(
          `UPDATE payment_intents
              SET status = $1, updated_at = now()
            WHERE provider_ref = $2`,
          [targetStatus, event.providerRef],
        );
      }

      await client.query('COMMIT');

      if (targetStatus === 'CAPTURED') {
        const updatedRes = await pool.query<PaymentIntentRow>(
          'SELECT * FROM payment_intents WHERE provider_ref = $1',
          [event.providerRef],
        );
        if (updatedRes.rows.length > 0) {
          const row = updatedRes.rows[0];
          for (const handler of this.paymentCaptureHandlers) {
            try {
              await handler(row);
            } catch (handlerErr) {
              console.error('Payment capture handler error:', handlerErr);
            }
          }
        }
      }

      return {
        eventId: event.eventId,
        duplicate: false,
        status: 'PROCESSED',
        eventType: event.eventType,
        providerRef: event.providerRef,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
