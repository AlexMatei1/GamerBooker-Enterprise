import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  BookingResult,
  BookingRow,
  BookingStatus,
  ConfirmBookingInput,
  TransitionBookingInput,
} from './bookings.types';
import type { HoldRow } from './holds.types';
import type { PriceQuoteRow } from './quotes.service';

export function generatePublicBookingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(6);
  let code = 'GB-';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Row shape of a package item joined with its product. */
interface PackageItemRow {
  product_id: string;
  title: string;
  price_minor: string | number;
  quantity: string | number;
  allocated_price_minor?: string | number | null;
  tax_category?: string | null;
  age_verification_required?: boolean | null;
  restricted_product_type?: string | null;
}

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
  NO_SHOW: [],
  COMPLETED: [],
};

const STATUS_TO_EVENT: Record<BookingStatus, string> = {
  CONFIRMED: 'BookingConfirmed',
  CHECKED_IN: 'CheckedIn',
  CANCELLED: 'BookingCancelled',
  NO_SHOW: 'BookingNoShow',
  COMPLETED: 'BookingCompleted',
};

@Injectable()
export class BookingsService {
  private mapBookingRow(row: BookingRow): BookingResult {
    return {
      id: row.id,
      public_code: row.public_code,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      customer_id: row.customer_id,
      hold_id: row.hold_id,
      quote_id: row.quote_id,
      package_id: row.package_id || null,
      status: row.status,
      type: row.type,
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      timezone: row.timezone,
      resource_ids: row.resource_ids,
      atomic_resource_ids: row.atomic_resource_ids,
      total_minor: Number(row.total_minor),
      due_now_minor: Number(row.due_now_minor),
      paid_minor: Number(row.paid_minor),
      balance_minor: Number(row.balance_minor),
      currency: row.currency,
      price_snapshot: row.price_snapshot,
      policy_snapshot: row.policy_snapshot,
      version: row.version,
      idempotency_key: row.idempotency_key,
      confirmed_at: new Date(row.confirmed_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * `dbClient` lets an owning flow (group checkout) run confirmation inside its
   * own transaction with its own locks. Without it, the group confirm would run
   * on a second connection while the first still holds `FOR UPDATE` on
   * `group_bookings`, so it could never observe the captured shares that prove
   * payment. With it, the group path does not bypass the captured-payment gate:
   * it satisfies the gate from rows this same transaction has locked and
   * updated, and booking + group status commit or roll back together.
   */
  async confirmBooking(
    actorId: string,
    input: ConfirmBookingInput,
    idempotencyKey?: string | null,
    requestId?: string,
    dbClient?: PoolClient,
  ): Promise<BookingResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const ownsTransaction = !dbClient;
    const preflight = dbClient ?? pool;

    // 1. Idempotency checks
    if (idempotencyKey) {
      const existingIdem = await preflight.query<BookingRow>(
        'SELECT * FROM bookings WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      if (existingIdem.rows.length > 0) {
        if (existingIdem.rows[0].customer_id !== actorId) {
          throw new AuthHttpError(
            HttpStatus.FORBIDDEN,
            'FORBIDDEN',
            'You do not have access to this booking',
          );
        }
        return this.mapBookingRow(existingIdem.rows[0]);
      }
    }

    const existingHoldBooking = await preflight.query<BookingRow>(
      'SELECT * FROM bookings WHERE hold_id = $1',
      [input.hold_id],
    );
    if (existingHoldBooking.rows.length > 0) {
      if (existingHoldBooking.rows[0].customer_id !== actorId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'You do not have access to this booking',
        );
      }
      return this.mapBookingRow(existingHoldBooking.rows[0]);
    }

    const client = dbClient ?? (await pool.connect());
    try {
      if (ownsTransaction) {
        await client.query('BEGIN');
      }

      // 2. Lock and validate hold
      const holdRes = await client.query<HoldRow>(
        'SELECT * FROM holds WHERE id = $1 FOR UPDATE',
        [input.hold_id],
      );
      if (holdRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'HOLD_NOT_FOUND',
          'Hold not found',
        );
      }

      const hold = holdRes.rows[0];

      if (hold.customer_id !== actorId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'You do not have access to this hold',
        );
      }

      // Check if hold is already consumed
      if (hold.status === 'CONSUMED') {
        const found = await client.query<BookingRow>(
          'SELECT * FROM bookings WHERE hold_id = $1',
          [hold.id],
        );
        if (found.rows.length > 0) {
          if (ownsTransaction) {
            await client.query('COMMIT');
          }
          return this.mapBookingRow(found.rows[0]);
        }
      }

      if (hold.status !== 'ACTIVE') {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'HOLD_NOT_ACTIVE',
          `Hold is in status '${hold.status}' and cannot be confirmed`,
        );
      }

      // Check hold expiry
      if (new Date(hold.expires_at).getTime() <= Date.now()) {
        await client.query(
          "UPDATE holds SET status = 'EXPIRED', updated_at = now() WHERE id = $1",
          [hold.id],
        );
        await client.query(
          "UPDATE resource_claims SET state = 'RELEASED', updated_at = now() WHERE hold_id = $1",
          [hold.id],
        );
        await client.query(
          `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
           VALUES ($1, 'HOLD', $2, 'HoldExpired', $3)`,
          [hold.tenant_id, hold.id, JSON.stringify({ hold_id: hold.id })],
        );
        if (ownsTransaction) {
          await client.query('COMMIT');
        }
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'HOLD_EXPIRED',
          'Hold has expired and cannot be confirmed',
        );
      }

      // 3. Load price quote
      const quoteRes = await client.query<PriceQuoteRow>(
        'SELECT * FROM price_quotes WHERE id = $1',
        [hold.quote_id],
      );
      if (quoteRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'QUOTE_NOT_FOUND',
          'Price quote associated with hold not found',
        );
      }
      const quote = quoteRes.rows[0];

      // A confirmed booking reports its upfront charge as paid. Require the
      // matching PSP capture under the same transaction before asserting that
      // state; a client-supplied intent ID alone is never proof of payment.
      //
      // A group hold is settled by its participants' intents rather than by one
      // solo intent, so its proof is the sum of CAPTURED intents attached to
      // that group booking. That sum is re-derived here from locked rows; it is
      // never taken from the caller.
      const dueNowMinor = Number(quote.due_now_minor);
      const proof = await this.resolveUpfrontPaymentProof(
        client,
        hold,
        dueNowMinor,
        quote.currency || 'RON',
        actorId,
        input.payment_intent_id,
      );
      const capturedPaymentIntentId = proof.soloIntentId;
      const settledGroupBookingId = proof.groupBookingId;


      // 4. Generate unique public booking code
      let publicCode = generatePublicBookingCode();
      const codeCheck = await client.query(
        'SELECT 1 FROM bookings WHERE public_code = $1',
        [publicCode],
      );
      if (codeCheck.rows.length > 0) {
        publicCode = generatePublicBookingCode();
      }

      // 5. Create Booking record
      const priceSnapshot = {
        items: quote.items_snapshot,
        total_minor: Number(quote.total_minor),
        due_now_minor: Number(quote.due_now_minor),
        balance_minor: Number(quote.balance_minor),
      };

      const packageId = hold.package_id || quote.package_id || null;

      const bookingRes = await client.query<BookingRow>(
        `INSERT INTO bookings (
           public_code, tenant_id, venue_id, customer_id, hold_id, quote_id, package_id,
           status, type, starts_at, ends_at, timezone, resource_ids, atomic_resource_ids,
           total_minor, due_now_minor, paid_minor, balance_minor, currency,
           price_snapshot, policy_snapshot, version, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', 'SINGLE', $8, $9, 'Europe/Bucharest',
                 $10, $11, $12, $13, $14, $15, 'RON', $16, $17, 1, $18)
         RETURNING *`,
        [
          publicCode,
          hold.tenant_id,
          hold.venue_id,
          hold.customer_id,
          hold.id,
          hold.quote_id,
          packageId,
          hold.starts_at,
          hold.ends_at,
          hold.resource_ids,
          hold.atomic_resource_ids,
          quote.total_minor,
          quote.due_now_minor,
          proof.soloIntentId || proof.groupBookingId ? quote.due_now_minor : 0,
          quote.balance_minor,
          JSON.stringify(priceSnapshot),
          JSON.stringify(quote.policy_snapshot),
          idempotencyKey || null,
        ],
      );
      const booking = bookingRes.rows[0];

      if (capturedPaymentIntentId) {
        const linked = await client.query(
          `UPDATE payment_intents SET booking_id = $1, updated_at = now()
             WHERE id = $2 AND booking_id IS NULL AND status = 'CAPTURED'`,
          [booking.id, capturedPaymentIntentId],
        );
        if ((linked.rowCount ?? 0) !== 1) {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'PAYMENT_ALREADY_APPLIED',
            'The payment was already applied to another booking',
          );
        }
      }

      if (settledGroupBookingId) {
        // The group's captured intents now back this booking. Mark them linked
        // so no later flow can re-settle the same money against a second one.
        await client.query(
          `UPDATE payment_intents SET booking_id = $1, updated_at = now()
             WHERE group_booking_id = $2 AND booking_id IS NULL AND status = 'CAPTURED'`,
          [booking.id, settledGroupBookingId],
        );
      }

      // 6. Transition hold to CONSUMED
      await client.query(
        "UPDATE holds SET status = 'CONSUMED', updated_at = now() WHERE id = $1",
        [hold.id],
      );

      // 7. Transition claims from ACTIVE_HOLD to CONFIRMED and link booking_id
      await client.query(
        `UPDATE resource_claims
            SET state = 'CONFIRMED', booking_id = $2, updated_at = now()
          WHERE hold_id = $1`,
        [hold.id, booking.id],
      );

      // 7b. If booking package, provision automatic pre-order for included consumables
      if (packageId) {
        const pkgItemsRes = await client.query<PackageItemRow>(
          `SELECT pi.*, p.title, p.price_minor, p.tax_category,
                  p.age_verification_required, p.restricted_product_type
             FROM package_items pi
             JOIN products p ON p.id = pi.product_id
            WHERE pi.package_id = $1`,
          [packageId],
        );

        if (pkgItemsRes.rows.length > 0) {
          const totalOrderMinor = pkgItemsRes.rows.reduce(
            (sum: number, r) =>
              sum + Number(r.allocated_price_minor || Number(r.price_minor) * Number(r.quantity)),
            0,
          );
          const orderPublicCode = `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;

          const orderRes = await client.query<{ id: string }>(
            `INSERT INTO orders (
               public_code, tenant_id, venue_id, booking_id, customer_id,
               order_type, fulfillment_mode, target_resource_id, status,
               total_minor, currency, notes
             ) VALUES ($1, $2, $3, $4, $5, 'PREORDER', 'AT_STATION', $6, 'PLACED', $7, 'RON', $8)
             RETURNING id`,
            [
              orderPublicCode,
              hold.tenant_id,
              hold.venue_id,
              booking.id,
              hold.customer_id,
              hold.resource_ids[0],
              Math.max(totalOrderMinor, 1),
              'Included in booking package',
            ],
          );
          const orderId = orderRes.rows[0].id;

          for (const item of pkgItemsRes.rows) {
            const itemAllocated = Number(item.allocated_price_minor || 0);
            const lineTotal = itemAllocated > 0 ? itemAllocated : Number(item.price_minor) * Number(item.quantity);
            const unitPrice = Math.max(1, Math.round(lineTotal / Number(item.quantity)));

            await client.query(
              `INSERT INTO order_items (
                 order_id, product_id, title, unit_price_minor, quantity,
                 line_total_minor, restricted_product_type, age_verification_required,
                 tax_category, status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')`,
              [
                orderId,
                item.product_id,
                item.title,
                unitPrice,
                item.quantity,
                lineTotal,
                item.restricted_product_type || 'NONE',
                Boolean(item.age_verification_required),
                item.tax_category || 'STANDARD',
              ],
            );
          }

          await client.query(
            `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
             VALUES ($1, 'ORDER', $2, 'OrderConfirmed', $3)`,
            [
              hold.tenant_id,
              orderId,
              JSON.stringify({
                order_id: orderId,
                public_code: orderPublicCode,
                booking_id: booking.id,
                status: 'PLACED',
              }),
            ],
          );
        }
      }

      // 8. Append-only audit log
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action, metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_CONFIRMED', $5, $6)`,
        [
          hold.tenant_id,
          hold.venue_id,
          actorId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            public_code: publicCode,
            hold_id: hold.id,
            total_minor: booking.total_minor,
            due_now_minor: booking.due_now_minor,
          }),
          reqId,
        ],
      );

      // 9. Transactional outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BookingConfirmed', $3)`,
        [
          hold.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            public_code: publicCode,
            venue_id: hold.venue_id,
            customer_id: hold.customer_id,
            starts_at: new Date(booking.starts_at).toISOString(),
            ends_at: new Date(booking.ends_at).toISOString(),
            total_minor: Number(booking.total_minor),
            due_now_minor: Number(booking.due_now_minor),
          }),
        ],
      );

      if (ownsTransaction) {
        await client.query('COMMIT');
      }
      return this.mapBookingRow(booking);
    } catch (err) {
      if (ownsTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      throw err;
    } finally {
      if (ownsTransaction) {
        (client as PoolClient).release();
      }
    }
  }

  /**
   * Verifies that the upfront amount this confirmation will report as paid was
   * really captured by a PSP. Runs inside the caller's transaction so it can
   * read the rows that transaction just locked/updated.
   *
   * Returns exactly one settlement source, or throws. `payment_intent_id` from
   * the request is only ever a lookup key: every field is re-checked against the
   * stored intent.
   */
  private async resolveUpfrontPaymentProof(
    client: PoolClient,
    hold: HoldRow,
    dueNowMinor: number,
    quoteCurrency: string,
    actorId: string,
    requestedIntentId?: string,
  ): Promise<{ soloIntentId: string | null; groupBookingId: string | null }> {
    const groupRes = await client.query<{
      id: string;
      organizer_id: string;
      booking_id: string | null;
      status: string;
      due_now_minor: string;
    }>(
      'SELECT id, organizer_id, booking_id, status, due_now_minor ' +
        'FROM group_bookings WHERE hold_id = $1 FOR UPDATE',
      [hold.id],
    );
    const groupBooking = groupRes.rows[0];

    if (groupBooking) {
      if (requestedIntentId) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_NOT_CAPTURED_OR_MISMATCHED',
          'A group hold is settled by its participants, not by a single intent',
        );
      }
      if (
        groupBooking.organizer_id !== actorId ||
        groupBooking.booking_id !== null ||
        groupBooking.status !== 'PENDING_PAYMENTS' ||
        Number(groupBooking.due_now_minor) !== dueNowMinor
      ) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_NOT_CAPTURED_OR_MISMATCHED',
          'The group booking is not awaiting confirmation for this hold',
        );
      }

      const capturedRes = await client.query<{ captured_minor: string }>(
        `SELECT COALESCE(SUM(amount_minor), 0) AS captured_minor
           FROM payment_intents
          WHERE group_booking_id = $1
            AND booking_id IS NULL
            AND status = 'CAPTURED'`,
        [groupBooking.id],
      );
      const capturedMinor = Number(capturedRes.rows[0]?.captured_minor || 0);
      if (capturedMinor < dueNowMinor) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_NOT_CAPTURED_OR_MISMATCHED',
          'The participants have not captured the upfront payment for this group booking',
        );
      }

      return { soloIntentId: null, groupBookingId: groupBooking.id };
    }

    if (dueNowMinor === 0) {
      if (requestedIntentId) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'UNEXPECTED_PAYMENT',
          'This booking does not require an upfront payment',
        );
      }
      return { soloIntentId: null, groupBookingId: null };
    }

    if (!requestedIntentId) {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_REQUIRED',
        'A captured upfront payment is required to confirm this booking',
      );
    }

    const paymentRes = await client.query<{
      id: string;
      tenant_id: string;
      venue_id: string;
      amount_minor: string;
      currency: string;
      status: string;
      booking_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      'SELECT id, tenant_id, venue_id, amount_minor, currency, status, booking_id, metadata ' +
        'FROM payment_intents WHERE id = $1 FOR UPDATE',
      [requestedIntentId],
    );
    const payment = paymentRes.rows[0];
    const metadata = payment?.metadata;
    if (
      !payment ||
      payment.status !== 'CAPTURED' ||
      payment.booking_id !== null ||
      payment.tenant_id !== hold.tenant_id ||
      payment.venue_id !== hold.venue_id ||
      Number(payment.amount_minor) !== dueNowMinor ||
      payment.currency !== quoteCurrency ||
      metadata?.type !== 'SOLO_BOOKING_CHECKOUT' ||
      metadata?.hold_id !== hold.id ||
      metadata?.customer_id !== actorId
    ) {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_NOT_CAPTURED_OR_MISMATCHED',
        'The upfront payment is not captured for this hold',
      );
    }
    return { soloIntentId: payment.id, groupBookingId: null };
  }

  async transitionBooking(
    bookingId: string,
    actorId: string,
    input: TransitionBookingInput,
    scope: { actorRole: 'CUSTOMER' } | { actorRole: 'STAFF'; venueId: string },
    requestId?: string,
  ): Promise<BookingResult> {
    const pool = getPool();
    const client = await pool.connect();
    const reqId = requestId || randomUUID();
    const actorRole = scope.actorRole;

    try {
      await client.query('BEGIN');

      // 1. Bind authority in the locked lookup, before version/state checks or
      // any side effect. A foreign ID has the same result as a missing ID.
      const res = await client.query<BookingRow>(
        `SELECT * FROM bookings WHERE id = $1
           AND (($2 = 'CUSTOMER' AND customer_id = $3)
             OR ($2 = 'STAFF' AND venue_id = $4)) FOR UPDATE`,
        [bookingId, actorRole, actorId, scope.actorRole === 'STAFF' ? scope.venueId : null],
      );
      if (res.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'BOOKING_NOT_FOUND',
          'Booking not found',
        );
      }

      const booking = res.rows[0];

      // 2. Concurrency check (optimistic lock)
      if (booking.version !== input.expected_version) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'CONCURRENCY_CONFLICT',
          `Booking version mismatch: expected ${input.expected_version}, found ${booking.version}`,
        );
      }

      // 3. State machine validation
      const allowed = ALLOWED_TRANSITIONS[booking.status] || [];
      if (!allowed.includes(input.target_status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_STATE_TRANSITION',
          `Cannot transition booking from '${booking.status}' to '${input.target_status}'`,
        );
      }

      // 4. If transitioning to CANCELLED, release resource claims
      if (input.target_status === 'CANCELLED') {
        await client.query(
          "UPDATE resource_claims SET state = 'CANCELLED', updated_at = now() WHERE booking_id = $1",
          [bookingId],
        );
      }

      // 5. Update booking state and increment version
      const updateRes = await client.query<BookingRow>(
        `UPDATE bookings
            SET status = $1, version = version + 1, updated_at = now()
          WHERE id = $2 AND version = $3 AND venue_id = $4
          RETURNING *`,
        [input.target_status, bookingId, input.expected_version, booking.venue_id],
      );
      const updatedBooking = updateRes.rows[0];

      // 6. Audit event
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           actor_role, reason, metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_STATE_TRANSITION', $5, $6, $7, $8)`,
        [
          booking.tenant_id,
          booking.venue_id,
          actorId,
          bookingId,
          actorRole || null,
          input.reason || null,
          JSON.stringify({
            from: booking.status,
            to: input.target_status,
            version: updatedBooking.version,
          }),
          reqId,
        ],
      );

      // 7. Transactional outbox event
      const eventType = STATUS_TO_EVENT[input.target_status];
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, $3, $4)`,
        [
          booking.tenant_id,
          bookingId,
          eventType,
          JSON.stringify({
            booking_id: bookingId,
            public_code: booking.public_code,
            previous_status: booking.status,
            new_status: input.target_status,
            version: updatedBooking.version,
            reason: input.reason || null,
          }),
        ],
      );

      await client.query('COMMIT');
      return this.mapBookingRow(updatedBooking);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getBookingById(bookingId: string, customerId?: string): Promise<BookingResult> {
    const pool = getPool();
    const res = await pool.query<BookingRow>(
      'SELECT * FROM bookings WHERE id = $1',
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
    if (customerId && booking.customer_id !== customerId) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Booking belongs to another customer',
      );
    }
    return this.mapBookingRow(booking);
  }

  async getBookingByCode(code: string, customerId?: string): Promise<BookingResult> {
    const pool = getPool();
    const res = await pool.query<BookingRow>(
      'SELECT * FROM bookings WHERE public_code = $1',
      [code],
    );
    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'BOOKING_NOT_FOUND',
        'Booking not found',
      );
    }
    const booking = res.rows[0];
    if (customerId && booking.customer_id !== customerId) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Booking belongs to another customer',
      );
    }
    return this.mapBookingRow(booking);
  }

  async listVenueBookings(venueId: string): Promise<BookingResult[]> {
    const pool = getPool();
    const res = await pool.query<BookingRow>(
      'SELECT * FROM bookings WHERE venue_id = $1 ORDER BY starts_at ASC',
      [venueId],
    );
    return res.rows.map((r) => this.mapBookingRow(r));
  }
}
