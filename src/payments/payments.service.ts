import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { SandboxPaymentProvider } from './sandbox-psp.provider';
import { StripePaymentProvider } from './stripe-psp.provider';
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

function stableMetadata(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<string, PaymentProvider> = new Map();
  private readonly paymentCaptureHandlers: Array<(intent: PaymentIntentRow) => Promise<void>> = [];

  constructor(
    private readonly sandboxProvider: SandboxPaymentProvider,
    @Optional() private readonly stripeProvider?: StripePaymentProvider,
  ) {
    this.registerProvider(sandboxProvider);
    if (stripeProvider) {
      this.registerProvider(stripeProvider);
    }
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
    bookingId?: string | null,
    dbClient?: Pick<PoolClient, 'query'>,
  ): Promise<IntentResult & { intentId: string }> {
    const provider = this.getProvider(providerName);
    const db = dbClient || getPool();

    // Check idempotency key first
    const existing = await db.query<PaymentIntentRow>(
      'SELECT * FROM payment_intents WHERE idempotency_key = $1',
      [input.idempotencyKey],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (
        row.tenant_id !== tenantId ||
        row.venue_id !== venueId ||
        row.provider !== providerName ||
        Number(row.amount_minor) !== input.amountMinor ||
        row.currency !== input.currency ||
        stableMetadata(row.metadata ?? {}) !== stableMetadata(input.metadata ?? {})
      ) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_KEY_REUSED',
          'This payment idempotency key was already used for a different payment',
        );
      }
      // Stripe returns the same PaymentIntent and its client secret for the
      // same idempotency key. Repeating only this idempotent PSP request lets a
      // mobile client resume a checkout without creating a second intent.
      let clientSecret: string | undefined;
      if (providerName === 'stripe') {
        const retry = await provider.createIntent(input);
        if (retry.providerRef !== row.provider_ref) {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'PAYMENT_PROVIDER_REFERENCE_MISMATCH',
            'The payment provider returned a different payment for this retry',
          );
        }
        clientSecret = retry.clientSecret;
      }
      return {
        intentId: row.id,
        providerRef: row.provider_ref,
        status: row.status,
        ...(clientSecret ? { clientSecret } : {}),
      };
    }

    const providerResult = await provider.createIntent(input);

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO payment_intents
        (tenant_id, venue_id, provider, provider_ref, idempotency_key, amount_minor, currency, status, metadata, group_booking_id, group_participant_id, booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        bookingId || null,
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

  /**
   * Guard for the sandbox capture shims (`POST /v1/.../payments/capture*`).
   *
   * Those routes exist only so the acceptance suites can move a sandbox
   * intent to CAPTURED the way a real PSP would, without a public tunnel. Two
   * rules keep them from becoming a "mark paid" shortcut for real money:
   *
   *   1. the caller must own the intent. Ownership lives in the intent
   *      metadata written at creation time: `customer_id` for solo, balance
   *      and order intents, `participant_user_id`/`organizer_id` for group
   *      intents. An anonymous or unrelated caller is rejected with 403.
   *   2. the intent must have been created with the sandbox provider. A real
   *      provider intent can only reach CAPTURED through the signed webhook
   *      in `processWebhook`, which verifies the PSP signature. The shims
   *      therefore cannot fake a Stripe capture even for an authenticated
   *      owner.
   *
   * The sandbox provider reports CAPTURED for any reference it is handed. That
   * is acceptable only because sandbox references carry no money, and it is
   * why these endpoints are logged as separate `*_SANDBOX_CAPTURE` audits
   * rather than as PSP confirmations.
   */
  async assertProviderCaptured(
    providerRef: string,
    callerId: string,
  ): Promise<PaymentIntentRow> {
    const pool = getPool();
    const res = await pool.query<PaymentIntentRow>(
      'SELECT * FROM payment_intents WHERE provider_ref = $1',
      [providerRef],
    );
    const intent = res.rows[0];
    if (!intent) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'PAYMENT_INTENT_NOT_FOUND',
        'Payment intent not found',
      );
    }
    const providerStatus = await this.getProvider(intent.provider)
      .getStatus(providerRef)
      .catch(() => 'PENDING' as const);
    if (providerStatus !== 'CAPTURED') {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_NOT_CAPTURED',
        'The payment provider has not captured this payment',
      );
    }
    if (intent.provider !== 'sandbox') {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'CAPTURE_REQUIRES_SIGNED_WEBHOOK',
        'Only the sandbox provider may be captured from this endpoint',
      );
    }

    const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
    const owners = [
      metadata.customer_id,
      metadata.participant_user_id,
      metadata.organizer_id,
      metadata.covered_by,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (owners.length === 0) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'PAYMENT_INTENT_HAS_NO_OWNER',
        'This payment intent cannot be captured from a client request',
      );
    }
    if (!owners.includes(callerId)) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'PAYMENT_INTENT_NOT_AUTHORIZED',
        'Payment intent does not belong to the authenticated customer',
      );
    }
    return intent;
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

      if (event.eventType === 'payment_intent.succeeded' || event.eventType === 'payment_intent.failed') {
        const intentResult = await client.query<PaymentIntentRow>(
          'SELECT * FROM payment_intents WHERE provider = $1 AND provider_ref = $2 FOR UPDATE',
          [providerName, event.providerRef],
        );
        const intentRow = intentResult.rows[0];
        if (!intentRow) {
          throw new AuthHttpError(
            HttpStatus.NOT_FOUND,
            'PAYMENT_INTENT_NOT_FOUND',
            'Payment intent not found',
          );
        }
        if (
          Number(intentRow.amount_minor) !== event.amountMinor ||
          intentRow.currency.toUpperCase() !== event.currency.toUpperCase()
        ) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'PAYMENT_EVENT_AMOUNT_MISMATCH',
            'Payment event amount or currency does not match the payment intent',
          );
        }
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
            WHERE provider = $2 AND provider_ref = $3`,
          [targetStatus, providerName, event.providerRef],
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
            } catch (handlerErr: unknown) {
              this.logger.error(
                'Payment capture handler error',
                handlerErr instanceof Error ? handlerErr.stack : String(handlerErr),
              );
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
