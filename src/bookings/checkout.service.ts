import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { BookingsService } from './bookings.service';
import { PaymentsService, type PaymentIntentRow } from '../payments/payments.service';
import type { BookingRow } from './bookings.types';
import type {
  BalanceSummary,
  CheckinResult,
  OfflineReceiptResult,
  PayBalanceInput,
  QrTokenData,
  ScanCheckinInput,
  SoloCheckoutInput,
  SoloPaymentIntentResult,
  SoloPaymentIntentStatusResult,
  SoloCheckoutResult,
  PayBalanceOnlineInput,
  PayBalanceOnlineResult,
  ReceiptFilterQuery,
  ReceiptLedgerResult,
  VoidReceiptInput,
  VoidReceiptResult,
} from './checkout.types';

export const DEFAULT_QR_SECRET = 'gamerbooker-qr-token-secret-0123456789abcdef';

/** Offline receipt row (optionally joined with booking/staff labels). */
interface OfflineReceiptRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  booking_id: string;
  booking_public_code: string;
  staff_id: string;
  staff_name: string | null;
  amount_minor: string | number;
  payment_method: string;
  reference: string;
  notes: string | null;
  voided_at?: Date | string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  created_at: Date | string;
}

/** Aggregated receipt-ledger totals row. */
interface ReceiptLedgerSummaryRow {
  total_count: string | number;
  total_collected_minor: string | number;
  cash_collected_minor: string | number;
  card_collected_minor: string | number;
  voided_count: string | number;
}

/**
 * Legacy rows may store policy settings either nested under `settings` or flat.
 * Read defensively so snapshots written by an older version still resolve.
 */
interface PolicySettingsView {
  prepaid_mode?: 'FULL' | 'DEPOSIT';
  deposit_percentage?: number;
  deposit_mode_settlement?: string;
  remaining_payment_methods?: unknown;
}

function policySettings(snapshot: unknown): PolicySettingsView {
  if (typeof snapshot !== 'object' || snapshot === null) return {};
  const record = snapshot as Record<string, unknown>;
  const nested = record.settings;
  if (typeof nested === 'object' && nested !== null) {
    return nested as PolicySettingsView;
  }
  return record as PolicySettingsView;
}

/** Returns the string members of an unknown array, or the fallback. */
function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === 'string');
}

interface RawQrPayload {
  b: string; // booking_id
  c: string; // public_code
  v: string; // venue_id
  n: string; // nonce
  e: string; // expires_at
  s: string; // signature
}

@Injectable()
export class CheckoutService implements OnModuleInit {
  private readonly qrSecret: string;

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService?: PaymentsService,
  ) {
    this.qrSecret = process.env.QR_SECRET || DEFAULT_QR_SECRET;
  }

  onModuleInit() {
    this.paymentsService?.onPaymentCaptured(async (intent) => {
      if (intent.metadata?.type === 'ONLINE_BALANCE_PAYMENT') {
        await this.handleBalancePaymentCaptured(intent.provider_ref);
      }
    });
  }

  private getPayments(): PaymentsService {
    if (!this.paymentsService) {
      throw new Error('PAYMENTS_SERVICE_NOT_INITIALIZED');
    }
    return this.paymentsService;
  }

  private computeQrSignature(
    bookingId: string,
    publicCode: string,
    venueId: string,
    nonce: string,
    expiresAt: string,
  ): string {
    const canonical = `${bookingId}:${publicCode}:${venueId}:${nonce}:${expiresAt}`;
    return createHmac('sha256', this.qrSecret).update(canonical).digest('hex');
  }

  generateQrToken(bookingId: string, publicCode: string, venueId: string): QrTokenData {
    const nonce = randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sig = this.computeQrSignature(bookingId, publicCode, venueId, nonce, expiresAt);

    const payload: RawQrPayload = {
      b: bookingId,
      c: publicCode,
      v: venueId,
      n: nonce,
      e: expiresAt,
      s: sig,
    };

    const token = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token,
      public_code: publicCode,
      expires_at: expiresAt,
      refresh_after_seconds: 600, // 10 minutes refresh recommendation
    };
  }

  verifyQrToken(token: string): { bookingId: string; publicCode: string; venueId: string } {
    let payload: RawQrPayload;
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      payload = JSON.parse(decoded);
    } catch {
      throw new AuthHttpError(HttpStatus.BAD_REQUEST, 'QR_INVALID', 'Invalid QR token format');
    }

    if (!payload.b || !payload.c || !payload.v || !payload.n || !payload.e || !payload.s) {
      throw new AuthHttpError(HttpStatus.BAD_REQUEST, 'QR_INVALID', 'Malformed QR token');
    }

    // Expiry check
    if (new Date(payload.e).getTime() <= Date.now()) {
      throw new AuthHttpError(HttpStatus.BAD_REQUEST, 'QR_EXPIRED', 'QR token has expired');
    }

    // Signature check
    const expectedSig = this.computeQrSignature(
      payload.b,
      payload.c,
      payload.v,
      payload.n,
      payload.e,
    );

    const sigBuf = Buffer.from(payload.s, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'QR_SIGNATURE_INVALID',
        'QR token signature is invalid',
      );
    }

    return {
      bookingId: payload.b,
      publicCode: payload.c,
      venueId: payload.v,
    };
  }

  // ---------------------------------------------------------------------------
  // Solo Checkout
  // ---------------------------------------------------------------------------

  async executeSoloCheckout(
    customerId: string,
    input: SoloCheckoutInput,
    idempotencyKey?: string | null,
    requestId?: string,
  ): Promise<SoloCheckoutResult> {
    // 1. Confirm the booking atomically via BookingsService
    const booking = await this.bookingsService.confirmBooking(
      customerId,
      { hold_id: input.hold_id, payment_intent_id: input.payment_intent_id },
      idempotencyKey,
      requestId,
    );

    // 2. Generate initial rolling QR token
    const qrData = this.generateQrToken(booking.id, booking.public_code, booking.venue_id);

    return {
      booking,
      qr_token: qrData.token,
      qr_expires_at: qrData.expires_at,
    };
  }

  async createSoloPaymentIntent(
    customerId: string,
    holdId: string,
    requestId?: string,
  ): Promise<SoloPaymentIntentResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const found = await pool.query<{
      id: string;
      tenant_id: string;
      venue_id: string;
      customer_id: string;
      quote_id: string;
      status: string;
      expires_at: Date;
      due_now_minor: string;
      currency: string;
    }>(
      `SELECT h.id, h.tenant_id, h.venue_id, h.customer_id, h.quote_id,
              h.status, h.expires_at, q.due_now_minor, q.currency
         FROM holds h JOIN price_quotes q ON q.id = h.quote_id
        WHERE h.id = $1`,
      [holdId],
    );
    const hold = found.rows[0];
    if (!hold) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'HOLD_NOT_FOUND', 'Hold not found');
    }
    if (hold.customer_id !== customerId) {
      throw new AuthHttpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Hold belongs to another customer');
    }
    if (hold.status !== 'ACTIVE' || new Date(hold.expires_at).getTime() <= Date.now()) {
      throw new AuthHttpError(HttpStatus.CONFLICT, 'HOLD_NOT_ACTIVE', 'Hold is not active');
    }

    const amountMinor = Number(hold.due_now_minor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new AuthHttpError(HttpStatus.BAD_REQUEST, 'ZERO_DUE_NOW', 'No upfront payment is required');
    }

    // This endpoint is intentionally live-provider-only. Sandbox intents are
    // test fixtures and must never be presented as money collected online.
    const idempotencyKey = `solo-booking:${hold.id}:${hold.quote_id}:${amountMinor}`;
    let intent;
    try {
      intent = await this.getPayments().createIntent(
        hold.tenant_id,
        hold.venue_id,
        {
          amountMinor,
          currency: 'RON',
          reference: `Hold:${hold.id}:Upfront`,
          idempotencyKey,
          metadata: {
            type: 'SOLO_BOOKING_CHECKOUT',
            hold_id: hold.id,
            customer_id: customerId,
          },
        },
        'stripe',
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('PSP_NOT_CONFIGURED:')) {
        throw new AuthHttpError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PAYMENT_PROVIDER_UNAVAILABLE',
          'Online payment is not configured for this environment',
        );
      }
      throw error;
    }

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, venue_id, request_id, actor_id, actor_role,
         action, target_type, target_id, metadata
       ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'SOLO_PAYMENT_INTENT_CREATED', 'HOLD', $5, $6)`,
      [
        hold.tenant_id,
        hold.venue_id,
        reqId,
        customerId,
        hold.id,
        JSON.stringify({ payment_intent_id: intent.intentId, amount_minor: amountMinor }),
      ],
    );

    return {
      intent_id: intent.intentId,
      provider_ref: intent.providerRef,
      client_secret: intent.clientSecret,
      amount_minor: amountMinor,
      currency: hold.currency || 'RON',
      hold_id: hold.id,
      status: intent.status,
      hold_expires_at: new Date(hold.expires_at).toISOString(),
    };
  }

  async getSoloPaymentIntentStatus(
    customerId: string,
    holdId: string,
    intentId: string,
  ): Promise<SoloPaymentIntentStatusResult> {
    const pool = getPool();
    const result = await pool.query<{
      id: string;
      amount_minor: string;
      currency: string;
      status: SoloPaymentIntentStatusResult['status'];
      updated_at: Date;
    }>(
      `SELECT pi.id, pi.amount_minor, pi.currency, pi.status, pi.updated_at
         FROM holds h
         JOIN payment_intents pi
           ON pi.tenant_id = h.tenant_id
          AND pi.venue_id = h.venue_id
        WHERE h.id = $1
          AND h.customer_id = $2
          AND pi.id = $3
          AND pi.metadata ->> 'type' = 'SOLO_BOOKING_CHECKOUT'
          AND pi.metadata ->> 'hold_id' = h.id::text
          AND pi.metadata ->> 'customer_id' = h.customer_id::text`,
      [holdId, customerId, intentId],
    );
    const intent = result.rows[0];
    if (!intent) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'PAYMENT_INTENT_NOT_FOUND',
        'Payment intent not found for this hold',
      );
    }
    return {
      intent_id: intent.id,
      hold_id: holdId,
      amount_minor: Number(intent.amount_minor),
      currency: intent.currency,
      status: intent.status,
      updated_at: new Date(intent.updated_at).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Customer QR Retrieval
  // ---------------------------------------------------------------------------

  async getBookingQr(bookingId: string, customerId: string): Promise<QrTokenData> {
    const booking = await this.bookingsService.getBookingById(bookingId, customerId);
    return this.generateQrToken(booking.id, booking.public_code, booking.venue_id);
  }

  // ---------------------------------------------------------------------------
  // Staff Check-in Scanner
  // ---------------------------------------------------------------------------

  async scanCheckin(
    venueId: string,
    staffId: string,
    input: ScanCheckinInput,
    requestId?: string,
    currentTime?: Date,
  ): Promise<CheckinResult> {
    const pool = getPool();
    const now = currentTime || new Date();
    const reqId = requestId || randomUUID();

    let targetBookingId: string | null = null;
    let targetCode: string | null = null;
    let qrTokenRef: string | null = null;

    if (input.qr_token) {
      const verified = this.verifyQrToken(input.qr_token);
      targetBookingId = verified.bookingId;
      targetCode = verified.publicCode;
      qrTokenRef = input.qr_token.slice(-16); // store last 16 chars as ref
      if (verified.venueId !== venueId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'VENUE_MISMATCH',
          'QR token belongs to a different venue',
        );
      }
    } else if (input.public_code) {
      targetCode = input.public_code.trim().toUpperCase();
    } else {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_INPUT',
        'Either qr_token or public_code must be provided',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and fetch booking
      let bookingRes;
      if (targetBookingId) {
        bookingRes = await client.query<BookingRow>(
          'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
          [targetBookingId],
        );
      } else {
        bookingRes = await client.query<BookingRow>(
          'SELECT * FROM bookings WHERE public_code = $1 FOR UPDATE',
          [targetCode],
        );
      }

      if (bookingRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'BOOKING_NOT_FOUND',
          'Booking not found',
        );
      }
      const booking = bookingRes.rows[0];

      // 2. Cross-venue check
      if (booking.venue_id !== venueId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'VENUE_MISMATCH',
          'Booking belongs to a different venue',
        );
      }

      // 3. Status checks
      if (booking.status === 'CHECKED_IN') {
        const checkinDb = await client.query<{ redeemed_at: Date }>(
          'SELECT redeemed_at FROM checkins WHERE booking_id = $1',
          [booking.id],
        );
        const redeemedAt = checkinDb.rows[0]?.redeemed_at || booking.updated_at;
        await client.query('COMMIT');
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'ALREADY_CHECKED_IN',
          `Booking was already checked in at ${new Date(redeemedAt).toISOString()}`,
        );
      }

      if (booking.status !== 'CONFIRMED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_BOOKING_STATUS',
          `Cannot check in booking in status '${booking.status}'`,
        );
      }

      // 4. Time window check (allowed from 15 minutes before starts_at up to ends_at)
      const startMs = new Date(booking.starts_at).getTime();
      const endMs = new Date(booking.ends_at).getTime();
      const allowedEarlyMs = startMs - 15 * 60 * 1000;

      if (now.getTime() < allowedEarlyMs) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'CHECKIN_TOO_EARLY',
          'Check-in is only available within 15 minutes before session start',
        );
      }

      if (now.getTime() > endMs) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'SESSION_ENDED',
          'Session has already concluded',
        );
      }

      // 5. Insert checkins record
      await client.query(
        `INSERT INTO checkins (tenant_id, venue_id, booking_id, staff_id, qr_token_ref, redeemed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [booking.tenant_id, venueId, booking.id, staffId, qrTokenRef, now],
      );

      // 6. Transition booking to CHECKED_IN
      await client.query(
        `UPDATE bookings
            SET status = 'CHECKED_IN', version = version + 1, updated_at = now()
          WHERE id = $1`,
        [booking.id],
      );

      // 7. Audit log
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'CHECKED_IN', $5, $6)`,
        [
          booking.tenant_id,
          venueId,
          staffId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            public_code: booking.public_code,
            qr_ref: qrTokenRef,
            redeemed_at: now.toISOString(),
          }),
          reqId,
        ],
      );

      // 8. Transactional outbox
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'CheckedIn', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            public_code: booking.public_code,
            venue_id: venueId,
            redeemed_at: now.toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');

      const policy = policySettings(booking.policy_snapshot);
      const remainingMethods = stringArray(policy.remaining_payment_methods, [
        'ONLINE_OR_RECEPTION',
      ]);

      return {
        status: 'CHECKED_IN',
        booking_id: booking.id,
        public_code: booking.public_code,
        redeemed_at: now.toISOString(),
        session_start: new Date(booking.starts_at).toISOString(),
        session_end: new Date(booking.ends_at).toISOString(),
        balance_minor: Number(booking.balance_minor),
        remaining_payment_methods: remainingMethods,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Balance Summary & Reception Settlement
  // ---------------------------------------------------------------------------

  async getBalanceSummary(bookingId: string, customerId?: string): Promise<BalanceSummary> {
    const booking = await this.bookingsService.getBookingById(bookingId, customerId);
    const settings = policySettings(booking.policy_snapshot);
    const prepaidMode =
      settings.prepaid_mode === 'FULL' || settings.prepaid_mode === 'DEPOSIT'
        ? settings.prepaid_mode
        : booking.balance_minor === 0
          ? 'FULL'
          : 'DEPOSIT';
    const depositSettlement =
      typeof settings.deposit_mode_settlement === 'string'
        ? settings.deposit_mode_settlement
        : null;

    return {
      booking_id: booking.id,
      public_code: booking.public_code,
      total_minor: booking.total_minor,
      paid_minor: booking.paid_minor,
      balance_minor: booking.balance_minor,
      currency: booking.currency,
      prepaid_mode: prepaidMode,
      deposit_percentage:
        typeof settings.deposit_percentage === 'number' ? settings.deposit_percentage : undefined,
      remaining_payment_methods: depositSettlement
        ? [depositSettlement]
        : ['ONLINE_OR_RECEPTION'],
      is_fully_paid: booking.balance_minor === 0,
    };
  }

  async payBalance(
    venueId: string,
    bookingId: string,
    staffId: string,
    input: PayBalanceInput,
    requestId?: string,
  ): Promise<OfflineReceiptResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (input.amount_minor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_AMOUNT',
        'Payment amount must be strictly greater than zero',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and fetch booking
      const res = await client.query<BookingRow>(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
        [bookingId],
      );
      if (res.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'BOOKING_NOT_FOUND',
          'Booking not found',
        );
      }

      const booking = res.rows[0];
      if (booking.venue_id !== venueId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'VENUE_MISMATCH',
          'Booking belongs to a different venue',
        );
      }

      const balanceMinor = Number(booking.balance_minor);
      const paidMinor = Number(booking.paid_minor);

      // T-022: an ONLINE_ONLY venue forbids settling the remaining balance at the
      // desk. Without this the policy was only a customer-facing string, and
      // reception could record cash the venue had declared it cannot accept.
      const deskPolicy = policySettings(booking.policy_snapshot);
      if (deskPolicy.deposit_mode_settlement === 'ONLINE_ONLY') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'ONLINE_SETTLEMENT_ONLY',
          'Venue policy requires the remaining balance to be settled online; the desk cannot record it.',
        );
      }

      // 2. Prevent overpayment
      if (input.amount_minor > balanceMinor) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'OVERPAYMENT_NOT_ALLOWED',
          `Payment amount (${input.amount_minor} bani) exceeds outstanding balance (${balanceMinor} bani)`,
        );
      }

      // 3. Insert offline receipt
      const receiptRes = await client.query<{
        id: string;
        venue_id: string;
        booking_id: string;
        staff_id: string;
        amount_minor: string;
        payment_method: string;
        reference: string;
        notes: string | null;
        created_at: Date;
      }>(
        `INSERT INTO offline_receipts (
           tenant_id, venue_id, booking_id, staff_id, amount_minor,
           payment_method, reference, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          booking.tenant_id,
          venueId,
          booking.id,
          staffId,
          input.amount_minor,
          input.payment_method,
          input.reference || `RCP-${randomBytes(4).toString('hex').toUpperCase()}`,
          input.notes || null,
        ],
      );
      const receipt = receiptRes.rows[0];

      // 4. Update booking paid and balance amounts
      const newPaid = paidMinor + input.amount_minor;
      const newBalance = balanceMinor - input.amount_minor;

      await client.query(
        `UPDATE bookings
            SET paid_minor = $1, balance_minor = $2, version = version + 1, updated_at = now()
          WHERE id = $3`,
        [newPaid, newBalance, booking.id],
      );

      // 5. Audit log
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'OFFLINE_PAYMENT_RECORDED', $5, $6)`,
        [
          booking.tenant_id,
          venueId,
          staffId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            receipt_id: receipt.id,
            amount_minor: input.amount_minor,
            payment_method: input.payment_method,
            reference: input.reference,
            remaining_balance: newBalance,
          }),
          reqId,
        ],
      );

      // 6. Outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BalancePaid', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            receipt_id: receipt.id,
            amount_minor: input.amount_minor,
            remaining_balance: newBalance,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        id: receipt.id,
        venue_id: receipt.venue_id,
        booking_id: receipt.booking_id,
        staff_id: receipt.staff_id,
        amount_minor: Number(receipt.amount_minor),
        payment_method: receipt.payment_method,
        reference: receipt.reference,
        notes: receipt.notes,
        created_at: new Date(receipt.created_at).toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-304: Online Remaining Balance Payment & Handling
  // ---------------------------------------------------------------------------

  async createOnlineBalanceIntent(
    customerId: string,
    bookingId: string,
    input?: PayBalanceOnlineInput,
    requestId?: string,
  ): Promise<PayBalanceOnlineResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const booking = await this.bookingsService.getBookingById(bookingId, customerId);

    const balanceMinor = Number(booking.balance_minor);
    if (balanceMinor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'NO_OUTSTANDING_BALANCE',
        'This booking has no outstanding balance to settle',
      );
    }

    const settings = policySettings(booking.policy_snapshot);
    const allowedMethods =
      typeof settings.deposit_mode_settlement === 'string'
        ? settings.deposit_mode_settlement
        : 'ONLINE_OR_RECEPTION';
    if (allowedMethods === 'RECEPTION_ONLY') {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'ONLINE_SETTLEMENT_NOT_ALLOWED',
        'Venue policy requires remaining balance to be settled at reception only',
      );
    }

    const amountMinor =
      input?.amount_minor && input.amount_minor > 0
        ? Math.min(input.amount_minor, balanceMinor)
        : balanceMinor;

    const idempotencyKey = `b-bal-${booking.id}-${amountMinor}-${Date.now()}`;

    const intent = await this.getPayments().createIntent(
      booking.tenant_id,
      booking.venue_id,
      {
        amountMinor,
        currency: 'RON',
        reference: `Booking:${booking.id}:Balance`,
        idempotencyKey,
        metadata: {
          type: 'ONLINE_BALANCE_PAYMENT',
          booking_id: booking.id,
          customer_id: customerId,
        },
      },
      'sandbox',
      null,
      null,
      booking.id,
    );

    await pool.query(
      `INSERT INTO audit_events (
        tenant_id, venue_id, request_id, actor_id, actor_role,
        action, target_type, target_id, metadata
      ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'ONLINE_BALANCE_INTENT_CREATED', 'BOOKING', $5, $6)`,
      [
        booking.tenant_id,
        booking.venue_id,
        reqId,
        customerId,
        booking.id,
        JSON.stringify({
          amount_minor: amountMinor,
          payment_intent_id: intent.intentId,
          provider_ref: intent.providerRef,
        }),
      ],
    );

    return {
      intent_id: intent.intentId,
      provider_ref: intent.providerRef,
      client_secret: intent.clientSecret,
      amount_minor: amountMinor,
      currency: 'RON',
      booking_id: booking.id,
      status: intent.status,
    };
  }

  async handleBalancePaymentCaptured(
    providerRef: string,
    requestId?: string,
    customerId?: string,
  ): Promise<{ applied_minor: number; refunded_minor: number; new_balance_minor: number }> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const piRes = await client.query<PaymentIntentRow>(
        'SELECT * FROM payment_intents WHERE provider_ref = $1 FOR UPDATE',
        [providerRef],
      );
      if (piRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'PAYMENT_INTENT_NOT_FOUND', 'Payment intent not found');
      }
      const pi = piRes.rows[0];

      // When called from an authenticated customer route, the caller must be
      // the customer the intent was created for. The trusted server-side
      // webhook path calls this without a customerId and skips the check.
      // payment_intents has no customer_id column: ownership is recorded in
      // the metadata written by createOnlineBalanceIntent.
      const intentCustomerId = pi.metadata?.customer_id;
      if (customerId && intentCustomerId && intentCustomerId !== customerId) {
        throw new AuthHttpError(HttpStatus.FORBIDDEN, 'PAYMENT_INTENT_NOT_AUTHORIZED', 'Payment intent does not belong to the authenticated customer');
      }

      if (!pi.booking_id) {
        await client.query('COMMIT');
        return { applied_minor: 0, refunded_minor: 0, new_balance_minor: 0 };
      }

      const bRes = await client.query<BookingRow>(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
        [pi.booking_id],
      );
      if (bRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      const booking = bRes.rows[0];

      const currentBalance = Number(booking.balance_minor);
      const paidMinor = Number(booking.paid_minor);
      const intentAmount = Number(pi.amount_minor);

      if (pi.status === 'CAPTURED') {
        await client.query('COMMIT');
        return { applied_minor: 0, refunded_minor: 0, new_balance_minor: currentBalance };
      }

      await client.query(
        "UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1",
        [pi.id],
      );

      // Overpayment detection: if current balance <= 0 (e.g. reception already paid it)
      if (currentBalance <= 0) {
        const refundRes = await this.getPayments().refund({
          providerRef: pi.provider_ref,
          amountMinor: intentAmount,
          idempotencyKey: `refund-bal-overpaid-${pi.id}`,
          reason: 'BALANCE_ALREADY_SETTLED_OVERPAYMENT',
        });

        await client.query(
          `INSERT INTO refunds (
            tenant_id, venue_id, booking_id, payment_intent_id,
            customer_id, amount_minor, currency, status, reason, provider_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, 'RON', 'SUCCEEDED', 'BALANCE_ALREADY_SETTLED_OVERPAYMENT', $7)`,
          [
            booking.tenant_id,
            booking.venue_id,
            booking.id,
            pi.id,
            booking.customer_id,
            intentAmount,
            refundRes.refundRef,
          ],
        );

        await client.query(
          `INSERT INTO audit_events (
            tenant_id, venue_id, request_id, actor_id, actor_role,
            action, target_type, target_id, metadata
          ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'ONLINE_BALANCE_REFUNDED_ALREADY_SETTLED', 'BOOKING', $5, $6)`,
          [
            booking.tenant_id,
            booking.venue_id,
            reqId,
            booking.customer_id,
            booking.id,
            JSON.stringify({
              payment_intent_id: pi.id,
              amount_minor: intentAmount,
              reason: 'Balance was already settled prior to capture',
            }),
          ],
        );

        await client.query('COMMIT');
        return { applied_minor: 0, refunded_minor: intentAmount, new_balance_minor: 0 };
      }

      const applied = Math.min(intentAmount, currentBalance);
      const excess = intentAmount - applied;
      const newPaid = paidMinor + applied;
      const newBalance = currentBalance - applied;

      await client.query(
        `UPDATE bookings
         SET paid_minor = $1, balance_minor = $2, version = version + 1, updated_at = now()
         WHERE id = $3`,
        [newPaid, newBalance, booking.id],
      );

      if (excess > 0) {
        const excessRefund = await this.getPayments().refund({
          providerRef: pi.provider_ref,
          amountMinor: excess,
          idempotencyKey: `refund-excess-${pi.id}`,
          reason: 'PARTIAL_EXCESS_OVERPAYMENT',
        });

        await client.query(
          `INSERT INTO refunds (
            tenant_id, venue_id, booking_id, payment_intent_id,
            customer_id, amount_minor, currency, status, reason, provider_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, 'RON', 'SUCCEEDED', 'PARTIAL_EXCESS_OVERPAYMENT', $7)`,
          [
            booking.tenant_id,
            booking.venue_id,
            booking.id,
            pi.id,
            booking.customer_id,
            excess,
            excessRefund.refundRef,
          ],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'ONLINE_BALANCE_PAID', 'BOOKING', $5, $6)`,
        [
          booking.tenant_id,
          booking.venue_id,
          reqId,
          booking.customer_id,
          booking.id,
          JSON.stringify({
            applied_minor: applied,
            excess_refunded_minor: excess,
            new_balance_minor: newBalance,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'BOOKING', $2, 'BalancePaid', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            amount_minor: applied,
            remaining_balance: newBalance,
          }),
        ],
      );

      await client.query('COMMIT');
      return { applied_minor: applied, refunded_minor: excess, new_balance_minor: newBalance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-304: Reception Offline Receipt Ledger & Voiding
  // ---------------------------------------------------------------------------

  async listReceiptLedger(
    venueId: string,
    filter: ReceiptFilterQuery,
  ): Promise<ReceiptLedgerResult> {
    const pool = getPool();
    const conditions: string[] = ['r.venue_id = $1'];
    const params: unknown[] = [venueId];
    let pIdx = 2;

    if (filter.from) {
      conditions.push(`r.created_at >= $${pIdx++}`);
      params.push(new Date(filter.from));
    }
    if (filter.to) {
      conditions.push(`r.created_at <= $${pIdx++}`);
      params.push(new Date(filter.to));
    }
    if (filter.staff_id) {
      conditions.push(`r.staff_id = $${pIdx++}`);
      params.push(filter.staff_id);
    }
    if (filter.payment_method) {
      conditions.push(`r.payment_method = $${pIdx++}`);
      params.push(filter.payment_method);
    }
    if (!filter.include_voided) {
      conditions.push('r.voided_at IS NULL');
    }

    const whereClause = conditions.join(' AND ');

    const limit = Math.min(Math.max(filter.limit || 50, 1), 100);
    const offset = Math.max((filter.page || 1) - 1, 0) * limit;

    const itemsQuery = `
      SELECT r.*, b.public_code as booking_public_code, u.email as staff_name
      FROM offline_receipts r
      JOIN bookings b ON b.id = r.booking_id
      LEFT JOIN users u ON u.id = r.staff_id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const itemsRes = await pool.query<OfflineReceiptRow>(itemsQuery, params);

    const summaryQuery = `
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN voided_at IS NULL THEN amount_minor ELSE 0 END), 0) as total_collected_minor,
        COALESCE(SUM(CASE WHEN voided_at IS NULL AND payment_method = 'CASH' THEN amount_minor ELSE 0 END), 0) as cash_collected_minor,
        COALESCE(SUM(CASE WHEN voided_at IS NULL AND payment_method IN ('POS_TERMINAL', 'RECEPTION_CARD') THEN amount_minor ELSE 0 END), 0) as card_collected_minor,
        COUNT(CASE WHEN voided_at IS NOT NULL THEN 1 END) as voided_count
      FROM offline_receipts r
      WHERE ${whereClause}
    `;

    const sumRes = await pool.query<ReceiptLedgerSummaryRow>(summaryQuery, params);
    const sumRow = sumRes.rows[0];

    return {
      receipts: itemsRes.rows.map((r) => ({
        id: r.id,
        venue_id: r.venue_id,
        booking_id: r.booking_id,
        booking_public_code: r.booking_public_code || undefined,
        staff_id: r.staff_id,
        staff_name: r.staff_name || undefined,
        amount_minor: Number(r.amount_minor),
        payment_method: r.payment_method,
        reference: r.reference,
        notes: r.notes,
        voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : null,
        voided_by: r.voided_by || null,
        void_reason: r.void_reason || null,
        created_at: new Date(r.created_at).toISOString(),
      })),
      total_count: Number(sumRow?.total_count || 0),
      summary: {
        total_collected_minor: Number(sumRow?.total_collected_minor || 0),
        cash_collected_minor: Number(sumRow?.cash_collected_minor || 0),
        card_collected_minor: Number(sumRow?.card_collected_minor || 0),
        voided_count: Number(sumRow?.voided_count || 0),
      },
    };
  }

  async voidReceipt(
    venueId: string,
    receiptId: string,
    staffId: string,
    input: VoidReceiptInput,
    requestId?: string,
  ): Promise<VoidReceiptResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    if (!input?.reason || input.reason.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_VOID_REASON',
        'Must provide a valid reason for voiding this receipt',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rRes = await client.query<OfflineReceiptRow>(
        'SELECT * FROM offline_receipts WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [receiptId, venueId],
      );
      if (rRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RECEIPT_NOT_FOUND', 'Offline receipt not found');
      }
      const receipt = rRes.rows[0];

      if (receipt.voided_at !== null) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'RECEIPT_ALREADY_VOIDED',
          'This receipt has already been voided',
        );
      }

      const bRes = await client.query<BookingRow>(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
        [receipt.booking_id],
      );
      if (bRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Associated booking not found');
      }
      const booking = bRes.rows[0];

      const receiptAmount = Number(receipt.amount_minor);
      const newPaid = Number(booking.paid_minor) - receiptAmount;
      const newBalance = Number(booking.balance_minor) + receiptAmount;

      await client.query(
        `UPDATE bookings
         SET paid_minor = $1, balance_minor = $2, version = version + 1, updated_at = now()
         WHERE id = $3`,
        [newPaid, newBalance, booking.id],
      );

      const now = new Date();
      await client.query(
        `UPDATE offline_receipts
         SET voided_at = $1, voided_by = $2, void_reason = $3
         WHERE id = $4`,
        [now, staffId, input.reason.trim(), receipt.id],
      );

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'STAFF', 'OFFLINE_RECEIPT_VOIDED', 'OFFLINE_RECEIPT', $5, $6)`,
        [
          receipt.tenant_id,
          venueId,
          reqId,
          staffId,
          receipt.id,
          JSON.stringify({
            receipt_id: receipt.id,
            booking_id: booking.id,
            reverted_amount_minor: receiptAmount,
            reason: input.reason.trim(),
            new_balance_minor: newBalance,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'OFFLINE_RECEIPT', $2, 'OfflineReceiptVoided', $3)`,
        [
          receipt.tenant_id,
          receipt.id,
          JSON.stringify({
            receipt_id: receipt.id,
            booking_id: booking.id,
            reverted_amount_minor: receiptAmount,
            new_balance_minor: newBalance,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        receipt_id: receipt.id,
        voided: true,
        booking_id: booking.id,
        reverted_amount_minor: receiptAmount,
        new_balance_minor: newBalance,
        new_paid_minor: newPaid,
        voided_at: now.toISOString(),
        voided_by: staffId,
        void_reason: input.reason.trim(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
