import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type { BookingRow } from './bookings.types';
import type { HoldRow } from './holds.types';
import type { PriceQuoteRow } from './quotes.service';
import type {
  CancelPolicyResult,
  ExtendSessionInput,
  ExtendSessionResult,
  NoShowResult,
  NoShowVerificationInput,
  RescheduleInput,
  RescheduleResult,
} from './lifecycle.types';

/**
 * Legacy rows may store policy settings either nested under `settings` or flat.
 * Read defensively so a snapshot written by an older version still resolves.
 */
interface PolicySettingsView {
  free_cancellation_hours?: number;
  late_cancellation_penalty_percent?: number;
  reschedule_cutoff_hours?: number;
  slot_granularity_minutes?: number;
  max_duration_minutes?: number;
  no_show_grace_minutes?: number;
  no_show_fee_percent?: number;
  [key: string]: unknown;
}

function settingsOf(snapshot: unknown): PolicySettingsView {
  if (typeof snapshot !== 'object' || snapshot === null) return {};
  const record = snapshot as Record<string, unknown>;
  const nested = record.settings;
  if (typeof nested === 'object' && nested !== null) {
    return nested as PolicySettingsView;
  }
  return record as PolicySettingsView;
}

/** Reads snapshot items defensively; the snapshot is a historical DB value. */
function snapshotItems(snapshot: unknown): Array<{ hourly_rate_minor?: number }> {
  if (typeof snapshot !== 'object' || snapshot === null) return [];
  const items = (snapshot as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items as Array<{ hourly_rate_minor?: number }>;
}

@Injectable()
export class LifecycleService {
  // ---------------------------------------------------------------------------
  // 1. Policy-Governed Cancellation & Refund Calculation
  // ---------------------------------------------------------------------------

  async cancelWithPolicy(
    bookingId: string,
    actorId: string,
    reason?: string,
    requestId?: string,
    currentTime?: Date,
  ): Promise<CancelPolicyResult> {
    const pool = getPool();
    const now = currentTime || new Date();
    const reqId = requestId || randomUUID();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
      if (booking.customer_id !== actorId) throw new AuthHttpError(HttpStatus.NOT_FOUND,'RESOURCE_NOT_FOUND','Resource not found.');

      if (booking.status !== 'CONFIRMED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_BOOKING_STATUS',
          `Cannot cancel booking in status '${booking.status}'`,
        );
      }

      const startMs = new Date(booking.starts_at).getTime();
      const nowMs = now.getTime();
      if (nowMs >= startMs) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'CANCELLATION_NOT_PERMITTED',
          'Cannot cancel session after it has already started',
        );
      }

      const settings = settingsOf(booking.policy_snapshot);

      const freeCancelHours = settings?.free_cancellation_hours ?? 3;
      const lateCancelPenaltyPercent = settings?.late_cancellation_penalty_percent ?? 50;

      const hoursUntilStart = (startMs - nowMs) / (3600 * 1000);
      const isFree = hoursUntilStart >= freeCancelHours;

      const paidMinor = Number(booking.paid_minor);
      const penaltyMinor = isFree
        ? 0
        : Math.round((paidMinor * lateCancelPenaltyPercent) / 100);
      const refundableMinor = paidMinor - penaltyMinor;

      // Update booking to CANCELLED
      await client.query(
        `UPDATE bookings
            SET status = 'CANCELLED', version = version + 1, updated_at = now()
          WHERE id = $1`,
        [booking.id],
      );

      // Release resource claims
      await client.query(
        `UPDATE resource_claims
            SET state = 'CANCELLED', updated_at = now()
          WHERE booking_id = $1`,
        [booking.id],
      );

      let refundId: string | null = null;
      if (refundableMinor > 0) {
        const refundRes = await client.query<{ id: string }>(
          `INSERT INTO refunds (
             tenant_id, venue_id, booking_id, customer_id, amount_minor,
             currency, status, reason
           )
           VALUES ($1, $2, $3, $4, $5, 'RON', 'REQUESTED', $6)
           RETURNING id`,
          [
            booking.tenant_id,
            booking.venue_id,
            booking.id,
            booking.customer_id,
            refundableMinor,
            isFree ? 'FREE_CANCELLATION' : 'LATE_CANCELLATION_WITH_PENALTY',
          ],
        );
        refundId = refundRes.rows[0].id;

        await client.query(
          `INSERT INTO outbox_events (
             tenant_id, aggregate_type, aggregate_id, event_type, payload
           )
           VALUES ($1, 'REFUND', $2, 'RefundRequested', $3)`,
          [
            booking.tenant_id,
            refundId,
            JSON.stringify({
              refund_id: refundId,
              booking_id: booking.id,
              amount_minor: refundableMinor,
            }),
          ],
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_CANCELLED', $5, $6)`,
        [
          booking.tenant_id,
          booking.venue_id,
          actorId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            is_free_cancellation: isFree,
            penalty_minor: penaltyMinor,
            refundable_minor: refundableMinor,
            refund_id: refundId,
            reason: reason || null,
          }),
          reqId,
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BookingCancelled', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            cancellation_type: isFree ? 'FREE' : 'LATE_WITH_PENALTY',
            penalty_minor: penaltyMinor,
            refundable_minor: refundableMinor,
            refund_id: refundId,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        booking_id: booking.id,
        status: 'CANCELLED',
        cancellation_type: isFree ? 'FREE' : 'LATE_WITH_PENALTY',
        paid_minor: paidMinor,
        penalty_minor: penaltyMinor,
        refundable_minor: refundableMinor,
        refund_id: refundId,
        cancelled_at: now.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Atomic Reschedule (Modify Slot / Resources)
  // ---------------------------------------------------------------------------

  async rescheduleBooking(
    bookingId: string,
    actorId: string,
    input: RescheduleInput,
    requestId?: string,
    currentTime?: Date,
  ): Promise<RescheduleResult> {
    const pool = getPool();
    const now = currentTime || new Date();
    const reqId = requestId || randomUUID();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and validate existing booking
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
      if (booking.customer_id !== actorId) throw new AuthHttpError(HttpStatus.NOT_FOUND,'RESOURCE_NOT_FOUND','Resource not found.');

      if (booking.status !== 'CONFIRMED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_BOOKING_STATUS',
          `Cannot reschedule booking in status '${booking.status}'`,
        );
      }

      if (booking.version !== input.expected_version) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'CONCURRENCY_CONFLICT',
          `Booking version mismatch: expected ${input.expected_version}, found ${booking.version}`,
        );
      }

      // Check reschedule cutoff hours
      const settings = settingsOf(booking.policy_snapshot);
      const rescheduleCutoffHours = settings?.reschedule_cutoff_hours ?? 4;

      const hoursUntilStart =
        (new Date(booking.starts_at).getTime() - now.getTime()) / (3600 * 1000);
      if (hoursUntilStart < rescheduleCutoffHours) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'RESCHEDULE_CUTOFF_EXCEEDED',
          `Rescheduling must be requested at least ${rescheduleCutoffHours} hours before session start`,
        );
      }

      // 2. Lock and validate new hold
      const holdRes = await client.query<HoldRow>(
        'SELECT * FROM holds WHERE id = $1 FOR UPDATE',
        [input.new_hold_id],
      );
      if (holdRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'HOLD_NOT_FOUND',
          'New hold not found',
        );
      }
      const newHold = holdRes.rows[0];

      if (newHold.status !== 'ACTIVE') {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'HOLD_NOT_ACTIVE',
          `Target hold is in status '${newHold.status}' and cannot be used for rescheduling`,
        );
      }

      if (new Date(newHold.expires_at).getTime() <= now.getTime()) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'HOLD_EXPIRED',
          'Target hold has expired',
        );
      }

      // 3. Load quote of new hold
      const quoteRes = await client.query<PriceQuoteRow>(
        'SELECT * FROM price_quotes WHERE id = $1',
        [newHold.quote_id],
      );
      if (quoteRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'QUOTE_NOT_FOUND',
          'Price quote for target hold not found',
        );
      }
      const newQuote = quoteRes.rows[0];

      // 4. Financial difference calculation
      const currentPaidMinor = Number(booking.paid_minor);
      const currentTotalMinor = Number(booking.total_minor);

      const newTotalMinor = Number(newQuote.total_minor);
      const newDueNowMinor = Number(newQuote.due_now_minor);

      const deltaTotalMinor = newTotalMinor - currentTotalMinor;
      const deltaDueNowMinor = newDueNowMinor - currentPaidMinor;

      let effectivePaidMinor = currentPaidMinor;
      let effectiveBalanceMinor = newTotalMinor - currentPaidMinor;
      let refundId: string | null = null;

      if (deltaDueNowMinor < 0) {
        // Refund excess prepaid funds
        const refundAmount = Math.abs(deltaDueNowMinor);
        effectivePaidMinor = newDueNowMinor;
        effectiveBalanceMinor = newTotalMinor - newDueNowMinor;

        const refundRes = await client.query<{ id: string }>(
          `INSERT INTO refunds (
             tenant_id, venue_id, booking_id, customer_id, amount_minor,
             currency, status, reason
           )
           VALUES ($1, $2, $3, $4, $5, 'RON', 'REQUESTED', 'RESCHEDULE_DIFFERENCE')
           RETURNING id`,
          [
            booking.tenant_id,
            booking.venue_id,
            booking.id,
            booking.customer_id,
            refundAmount,
          ],
        );
        refundId = refundRes.rows[0].id;
      } else if (deltaDueNowMinor > 0) {
        // Additional payment collected
        effectivePaidMinor = currentPaidMinor + deltaDueNowMinor;
        effectiveBalanceMinor = newTotalMinor - effectivePaidMinor;
      }

      // 5. Swap claims atomically:
      // Release previous booking claims
      await client.query(
        `UPDATE resource_claims
            SET state = 'CANCELLED', updated_at = now()
          WHERE booking_id = $1`,
        [booking.id],
      );

      // Convert new hold claims to CONFIRMED under booking_id
      await client.query(
        `UPDATE resource_claims
            SET state = 'CONFIRMED', booking_id = $2, updated_at = now()
          WHERE hold_id = $1`,
        [newHold.id, booking.id],
      );

      // Mark new hold as CONSUMED
      await client.query(
        `UPDATE holds
            SET status = 'CONSUMED', updated_at = now()
          WHERE id = $1`,
        [newHold.id],
      );

      // 6. Update booking
      const newPriceSnapshot = {
        items: newQuote.items_snapshot,
        total_minor: newTotalMinor,
        due_now_minor: newDueNowMinor,
        balance_minor: effectiveBalanceMinor,
      };

      const updatedRes = await client.query<BookingRow>(
        `UPDATE bookings
            SET starts_at = $1, ends_at = $2, resource_ids = $3, atomic_resource_ids = $4,
                total_minor = $5, due_now_minor = $6, paid_minor = $7, balance_minor = $8,
                price_snapshot = $9, policy_snapshot = $10, quote_id = $11, hold_id = $12,
                version = version + 1, updated_at = now()
          WHERE id = $13
          RETURNING *`,
        [
          newHold.starts_at,
          newHold.ends_at,
          newHold.resource_ids,
          newHold.atomic_resource_ids,
          newTotalMinor,
          newDueNowMinor,
          effectivePaidMinor,
          effectiveBalanceMinor,
          JSON.stringify(newPriceSnapshot),
          JSON.stringify(newQuote.policy_snapshot),
          newHold.quote_id,
          newHold.id,
          booking.id,
        ],
      );
      const updatedBooking = updatedRes.rows[0];

      // 7. Audit log & outbox event
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_RESCHEDULED', $5, $6)`,
        [
          booking.tenant_id,
          booking.venue_id,
          actorId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            previous_starts_at: booking.starts_at,
            new_starts_at: newHold.starts_at,
            delta_total_minor: deltaTotalMinor,
            delta_due_now_minor: deltaDueNowMinor,
            refund_id: refundId,
            reason: input.reason || null,
          }),
          reqId,
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BookingRescheduled', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            starts_at: new Date(updatedBooking.starts_at).toISOString(),
            ends_at: new Date(updatedBooking.ends_at).toISOString(),
            total_minor: Number(updatedBooking.total_minor),
            version: updatedBooking.version,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        booking_id: booking.id,
        status: 'CONFIRMED',
        starts_at: new Date(updatedBooking.starts_at).toISOString(),
        ends_at: new Date(updatedBooking.ends_at).toISOString(),
        resource_ids: updatedBooking.resource_ids,
        atomic_resource_ids: updatedBooking.atomic_resource_ids,
        total_minor: Number(updatedBooking.total_minor),
        due_now_minor: Number(updatedBooking.due_now_minor),
        paid_minor: Number(updatedBooking.paid_minor),
        balance_minor: Number(updatedBooking.balance_minor),
        delta_total_minor: deltaTotalMinor,
        delta_due_now_minor: deltaDueNowMinor,
        refund_id: refundId,
        version: updatedBooking.version,
        rescheduled_at: now.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Contiguous In-Session Extension
  // ---------------------------------------------------------------------------

  async extendSession(
    bookingId: string,
    actorId: string,
    input: ExtendSessionInput,
    requestId?: string,
    venueId?: string,
  ): Promise<ExtendSessionResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (input.additional_minutes <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DURATION',
        'Additional minutes must be strictly greater than zero',
      );
    }

    const client = await pool.connect();
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

      if (venueId ? booking.venue_id !== venueId : booking.customer_id !== actorId) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Resource not found.');
      }

      if (!['CONFIRMED', 'CHECKED_IN'].includes(booking.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_BOOKING_STATUS',
          `Cannot extend session in status '${booking.status}'`,
        );
      }

      if (booking.version !== input.expected_version) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'CONCURRENCY_CONFLICT',
          `Booking version mismatch: expected ${input.expected_version}, found ${booking.version}`,
        );
      }

      // Check policy granularity and max duration
      const settings = settingsOf(booking.policy_snapshot);

      const granularity = settings?.slot_granularity_minutes ?? 15;
      if (input.additional_minutes % granularity !== 0) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_EXTENSION_DURATION',
          `Extension duration must be a multiple of ${granularity} minutes`,
        );
      }

      const currentDurationMin =
        (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000;
      const newDurationMin = currentDurationMin + input.additional_minutes;
      const maxDurationMin = settings?.max_duration_minutes ?? 480;

      if (newDurationMin > maxDurationMin) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'EXTENSION_EXCEEDS_MAX_DURATION',
          `Total session duration (${newDurationMin}m) exceeds maximum permitted duration (${maxDurationMin}m)`,
        );
      }

      // 2. Define contiguous extension interval
      const extStart = new Date(booking.ends_at);
      const extEnd = new Date(extStart.getTime() + input.additional_minutes * 60000);

      // 3. Check availability over [extStart, extEnd) for atomic resources
      const conflictingClaims = await client.query<{ resource_id: string }>(
        `SELECT resource_id FROM resource_claims
          WHERE resource_id = ANY($1::uuid[])
            AND state IN ('ACTIVE_HOLD', 'CONFIRMED')
            AND slot && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
        [booking.atomic_resource_ids, extStart.toISOString(), extEnd.toISOString()],
      );

      if (conflictingClaims.rows.length > 0) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'EXTENSION_UNAVAILABLE',
          'The requested extension slot is already booked or held by another customer',
        );
      }

      // 4. Calculate extension price from effective rates
      const items = snapshotItems(booking.price_snapshot);
      const totalHourlyRateMinor = items.reduce(
        (sum: number, it) => sum + (it.hourly_rate_minor || 2000),
        0,
      ) || 2000;

      const extensionCostMinor = Math.round(
        (totalHourlyRateMinor * input.additional_minutes) / 60,
      );

      // 5. Insert claims for extension interval
      for (const resId of booking.atomic_resource_ids) {
        await client.query(
          `INSERT INTO resource_claims (
             resource_id, tenant_id, holder_id, booking_id, claim_type, state, slot
           )
           VALUES ($1, $2, $3, $4, 'BOOKING', 'CONFIRMED', tstzrange($5::timestamptz, $6::timestamptz, '[)'))`,
          [
            resId,
            booking.tenant_id,
            booking.customer_id,
            booking.id,
            extStart.toISOString(),
            extEnd.toISOString(),
          ],
        );
      }

      // 6. Update booking totals and ends_at
      const newTotal = Number(booking.total_minor) + extensionCostMinor;
      const newPaid = Number(booking.paid_minor) + extensionCostMinor;
      const newBalance = Number(booking.balance_minor);

      const updateRes = await client.query<BookingRow>(
        `UPDATE bookings
            SET ends_at = $1, total_minor = $2, paid_minor = $3,
                version = version + 1, updated_at = now()
          WHERE id = $4
          RETURNING *`,
        [extEnd.toISOString(), newTotal, newPaid, booking.id],
      );
      const updatedBooking = updateRes.rows[0];

      // 7. Audit log & outbox event
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_EXTENDED', $5, $6)`,
        [
          booking.tenant_id,
          booking.venue_id,
          actorId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            additional_minutes: input.additional_minutes,
            previous_ends_at: booking.ends_at,
            new_ends_at: extEnd.toISOString(),
            extension_cost_minor: extensionCostMinor,
          }),
          reqId,
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BookingExtended', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            ends_at: extEnd.toISOString(),
            extension_minutes: input.additional_minutes,
            extension_cost_minor: extensionCostMinor,
            version: updatedBooking.version,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        booking_id: booking.id,
        previous_ends_at: new Date(booking.ends_at).toISOString(),
        new_ends_at: extEnd.toISOString(),
        extension_minutes: input.additional_minutes,
        extension_cost_minor: extensionCostMinor,
        new_total_minor: newTotal,
        new_paid_minor: newPaid,
        new_balance_minor: newBalance,
        version: updatedBooking.version,
        extended_at: new Date().toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Staff No-Show Verification & Equipment Release
  // ---------------------------------------------------------------------------

  async verifyNoShow(
    venueId: string,
    bookingId: string,
    staffId: string,
    input: NoShowVerificationInput,
    requestId?: string,
    currentTime?: Date,
  ): Promise<NoShowResult> {
    const pool = getPool();
    const now = currentTime || new Date();
    const reqId = requestId || randomUUID();

    if (!input.staff_verified_empty) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'STAFF_VERIFICATION_REQUIRED',
        'Staff must verify that the equipment is physically unoccupied before marking no-show',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Resource not found.',
        );
      }

      if (booking.status !== 'CONFIRMED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_BOOKING_STATUS',
          `Cannot mark no-show for booking in status '${booking.status}'`,
        );
      }

      if (booking.version !== input.expected_version) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'CONCURRENCY_CONFLICT',
          `Booking version mismatch: expected ${input.expected_version}, found ${booking.version}`,
        );
      }

      // Check grace period
      const settings = settingsOf(booking.policy_snapshot);

      const graceMinutes = settings?.no_show_grace_minutes ?? 15;
      const startMs = new Date(booking.starts_at).getTime();
      const graceEndMs = startMs + graceMinutes * 60000;

      if (now.getTime() < graceEndMs) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'NO_SHOW_GRACE_ACTIVE',
          `No-show cannot be marked during the active grace period (${graceMinutes} minutes after start)`,
        );
      }

      // Penalty calculation
      const noShowFeePercent = settings?.no_show_fee_percent ?? 100;
      const paidMinor = Number(booking.paid_minor);
      const forfeitedMinor = Math.round((paidMinor * noShowFeePercent) / 100);
      const refundableMinor = paidMinor - forfeitedMinor;

      // Update booking to NO_SHOW
      await client.query(
        `UPDATE bookings
            SET status = 'NO_SHOW', version = version + 1, updated_at = now()
          WHERE id = $1`,
        [booking.id],
      );

      // Release resource claims so equipment is immediately available for walk-in re-sale
      await client.query(
        `UPDATE resource_claims
            SET state = 'RELEASED', updated_at = now()
          WHERE booking_id = $1`,
        [booking.id],
      );

      let refundId: string | null = null;
      if (refundableMinor > 0) {
        const refundRes = await client.query<{ id: string }>(
          `INSERT INTO refunds (
             tenant_id, venue_id, booking_id, customer_id, amount_minor,
             currency, status, reason
           )
           VALUES ($1, $2, $3, $4, $5, 'RON', 'REQUESTED', 'NO_SHOW_PARTIAL_REFUND')
           RETURNING id`,
          [
            booking.tenant_id,
            booking.venue_id,
            booking.id,
            booking.customer_id,
            refundableMinor,
          ],
        );
        refundId = refundRes.rows[0].id;
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, actor_id, target_type, target_id, action,
           metadata, request_id
         )
         VALUES ($1, $2, $3, 'BOOKING', $4, 'BOOKING_NO_SHOW', $5, $6)`,
        [
          booking.tenant_id,
          venueId,
          staffId,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            staff_verified_empty: true,
            forfeited_minor: forfeitedMinor,
            refundable_minor: refundableMinor,
            refund_id: refundId,
            notes: input.notes || null,
          }),
          reqId,
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'BOOKING', $2, 'BookingNoShow', $3)`,
        [
          booking.tenant_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            forfeited_minor: forfeitedMinor,
            refundable_minor: refundableMinor,
            refund_id: refundId,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        booking_id: booking.id,
        status: 'NO_SHOW',
        forfeited_minor: forfeitedMinor,
        refundable_minor: refundableMinor,
        refund_id: refundId,
        staff_id: staffId,
        verified_at: now.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
