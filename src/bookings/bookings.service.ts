import { HttpStatus, Injectable } from '@nestjs/common';
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

  async confirmBooking(
    actorId: string,
    input: ConfirmBookingInput,
    idempotencyKey?: string | null,
    requestId?: string,
  ): Promise<BookingResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    // 1. Idempotency checks
    if (idempotencyKey) {
      const existingIdem = await pool.query<BookingRow>(
        'SELECT * FROM bookings WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      if (existingIdem.rows.length > 0) {
        return this.mapBookingRow(existingIdem.rows[0]);
      }
    }

    const existingHoldBooking = await pool.query<BookingRow>(
      'SELECT * FROM bookings WHERE hold_id = $1',
      [input.hold_id],
    );
    if (existingHoldBooking.rows.length > 0) {
      return this.mapBookingRow(existingHoldBooking.rows[0]);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      // Check if hold is already consumed
      if (hold.status === 'CONSUMED') {
        const found = await client.query<BookingRow>(
          'SELECT * FROM bookings WHERE hold_id = $1',
          [hold.id],
        );
        if (found.rows.length > 0) {
          await client.query('COMMIT');
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
        await client.query('COMMIT');
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

      const packageId = hold.package_id || (quote as any).package_id || null;

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
          quote.due_now_minor, // paid_minor satisfied upon confirmation
          quote.balance_minor,
          JSON.stringify(priceSnapshot),
          JSON.stringify(quote.policy_snapshot),
          idempotencyKey || null,
        ],
      );
      const booking = bookingRes.rows[0];

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
        const pkgItemsRes = await client.query<any>(
          `SELECT pi.*, p.title, p.price_minor, p.tax_category,
                  p.age_verification_required, p.restricted_product_type
             FROM package_items pi
             JOIN products p ON p.id = pi.product_id
            WHERE pi.package_id = $1`,
          [packageId],
        );

        if (pkgItemsRes.rows.length > 0) {
          const totalOrderMinor = pkgItemsRes.rows.reduce(
            (sum: number, r: any) => sum + Number(r.allocated_price_minor || r.price_minor * r.quantity),
            0,
          );
          const orderPublicCode = `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;

          const orderRes = await client.query<any>(
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

      await client.query('COMMIT');
      return this.mapBookingRow(booking);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async transitionBooking(
    bookingId: string,
    actorId: string,
    input: TransitionBookingInput,
    actorRole?: string,
    requestId?: string,
  ): Promise<BookingResult> {
    const pool = getPool();
    const client = await pool.connect();
    const reqId = requestId || randomUUID();

    try {
      await client.query('BEGIN');

      // 1. Lock and validate booking
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

      // BOLA check: customer cannot act on another customer's booking
      if (actorRole === 'CUSTOMER' && booking.customer_id !== actorId) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'BOOKING_NOT_FOUND',
          'Booking not found',
        );
      }

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
          WHERE id = $2 AND version = $3
          RETURNING *`,
        [input.target_status, bookingId, input.expected_version],
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
