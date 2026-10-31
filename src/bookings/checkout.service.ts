import { HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { BookingsService } from './bookings.service';
import type { BookingRow } from './bookings.types';
import type {
  BalanceSummary,
  CheckinResult,
  OfflineReceiptResult,
  PayBalanceInput,
  QrTokenData,
  ScanCheckinInput,
  SoloCheckoutInput,
  SoloCheckoutResult,
} from './checkout.types';

export const DEFAULT_QR_SECRET = 'gamerbooker-qr-token-secret-0123456789abcdef';

interface RawQrPayload {
  b: string; // booking_id
  c: string; // public_code
  v: string; // venue_id
  n: string; // nonce
  e: string; // expires_at
  s: string; // signature
}

@Injectable()
export class CheckoutService {
  private readonly qrSecret: string;

  constructor(private readonly bookingsService: BookingsService) {
    this.qrSecret = process.env.QR_SECRET || DEFAULT_QR_SECRET;
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

      const policy = booking.policy_snapshot as any;
      const remainingMethods = policy?.remaining_payment_methods || ['ONLINE_OR_RECEPTION'];

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
    const policy = booking.policy_snapshot as any;
    const settings = policy?.settings || policy;

    return {
      booking_id: booking.id,
      public_code: booking.public_code,
      total_minor: booking.total_minor,
      paid_minor: booking.paid_minor,
      balance_minor: booking.balance_minor,
      currency: booking.currency,
      prepaid_mode: settings?.prepaid_mode || (booking.balance_minor === 0 ? 'FULL' : 'DEPOSIT'),
      deposit_percentage: settings?.deposit_percentage,
      remaining_payment_methods: settings?.deposit_mode_settlement
        ? [settings.deposit_mode_settlement]
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
          input.reference,
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
}
