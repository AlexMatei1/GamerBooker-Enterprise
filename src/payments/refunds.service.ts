import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { PaymentsService, type PaymentIntentRow } from './payments.service';
import type {
  RefundStatus,
  RequestRefundInput,
  RefundResultItem,
  RefundListFilter,
  RefundListResult,
} from './refunds.types';

@Injectable()
export class RefundsService {
  constructor(private readonly paymentsService: PaymentsService) {}

  async requestRefund(
    venueId: string,
    staffId: string,
    staffRole: string,
    input: RequestRefundInput,
    requestId?: string,
  ): Promise<RefundResultItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input.amount_minor || input.amount_minor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REFUND_AMOUNT',
        'Refund amount must be a positive integer in minor currency units.',
      );
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_REFUND_REASON',
        'Refund reason is required.',
      );
    }

    // Check idempotency if provided
    if (input.idempotency_key) {
      const existing = await pool.query<any>(
        'SELECT r.*, u.email as customer_email FROM refunds r JOIN users u ON u.id = r.customer_id WHERE r.venue_id = $1 AND r.idempotency_key = $2',
        [venueId, input.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.mapRefundRow(existing.rows[0]);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Locate and lock the target payment intent
      let pi: PaymentIntentRow | null = null;
      if (input.payment_intent_id) {
        const piRes = await client.query<PaymentIntentRow>(
          'SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE',
          [input.payment_intent_id],
        );
        if (piRes.rows.length === 0) {
          throw new AuthHttpError(
            HttpStatus.NOT_FOUND,
            'PAYMENT_INTENT_NOT_FOUND',
            'Payment intent not found.',
          );
        }
        pi = piRes.rows[0];
      } else if (input.booking_id) {
        const queryParams: any[] = [input.booking_id, venueId];
        let customerFilter = '';
        if (input.customer_id) {
          customerFilter = ' AND (group_participant_id IN (SELECT id FROM group_participants WHERE user_id = $3) OR $3 = $3)';
          queryParams.push(input.customer_id);
        }
        const piRes = await client.query<PaymentIntentRow>(
          `SELECT * FROM payment_intents
            WHERE booking_id = $1 AND venue_id = $2 ${customerFilter}
            ORDER BY created_at DESC
            FOR UPDATE`,
          queryParams,
        );
        if (piRes.rows.length === 0) {
          throw new AuthHttpError(
            HttpStatus.NOT_FOUND,
            'PAYMENT_INTENT_NOT_FOUND',
            'No matching payment intent found for this booking.',
          );
        }
        pi = piRes.rows[0];
      } else {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'MISSING_PAYMENT_TARGET',
          'Either payment_intent_id or booking_id is required.',
        );
      }

      if (pi.venue_id !== venueId) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'PAYMENT_INTENT_NOT_FOUND',
          'Payment intent does not belong to this venue.',
        );
      }

      if (pi.status !== 'CAPTURED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INTENT_NOT_CAPTURED',
          `Cannot refund intent in status '${pi.status}'. Only CAPTURED intents can be refunded.`,
        );
      }

      // 2. Lock & calculate existing refunds for this intent
      const existingRefundsRes = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount_minor), 0) as total
           FROM refunds
          WHERE payment_intent_id = $1
            AND status IN ('REQUESTED', 'APPROVED', 'SUBMITTED', 'SUCCEEDED')`,
        [pi.id],
      );
      const existingRefundedMinor = Number(existingRefundsRes.rows[0]?.total || 0);
      const intentAmountMinor = Number(pi.amount_minor);

      if (existingRefundedMinor + input.amount_minor > intentAmountMinor) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'REFUND_AMOUNT_EXCEEDS_CAPTURED',
          `Requested refund of ${input.amount_minor} exceeds remaining refundable amount (${intentAmountMinor - existingRefundedMinor}).`,
        );
      }

      // 3. Resolve customer ID (original payer)
      let customerId = input.customer_id;
      if (!customerId && pi.booking_id) {
        const bRes = await client.query<{ customer_id: string }>(
          'SELECT customer_id FROM bookings WHERE id = $1',
          [pi.booking_id],
        );
        if (bRes.rows.length > 0) {
          customerId = bRes.rows[0].customer_id;
        }
      }
      if (!customerId && pi.group_participant_id) {
        const gpRes = await client.query<{ user_id: string }>(
          'SELECT user_id FROM group_participants WHERE id = $1',
          [pi.group_participant_id],
        );
        if (gpRes.rows.length > 0) {
          customerId = gpRes.rows[0].user_id;
        }
      }
      if (!customerId) {
        // Fallback to searching user by customer_id if stored in metadata
        customerId = (pi.metadata as any)?.customer_id;
      }
      if (!customerId) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'CUSTOMER_RESOLUTION_FAILED',
          'Could not determine original payer customer ID for this refund.',
        );
      }

      // 4. Initial status determination:
      // Reception staff requests require manager approval.
      // Owner/Manager can auto-approve unless explicit approval is requested.
      const isManager = staffRole === 'OWNER' || staffRole === 'VENUE_MANAGER';
      const initialStatus: RefundStatus =
        !isManager || input.requires_approval ? 'REQUESTED' : 'APPROVED';

      const approvedBy = initialStatus === 'APPROVED' ? staffId : null;
      const approvedAt = initialStatus === 'APPROVED' ? new Date() : null;

      const inserted = await client.query<any>(
        `INSERT INTO refunds (
           tenant_id, venue_id, booking_id, payment_intent_id, group_booking_id,
           customer_id, amount_minor, currency, status, reason, approved_by,
           approved_at, idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          pi.tenant_id,
          venueId,
          pi.booking_id,
          pi.id,
          pi.group_booking_id || null,
          customerId,
          input.amount_minor,
          pi.currency || 'RON',
          initialStatus,
          input.reason,
          approvedBy,
          approvedAt,
          input.idempotency_key || null,
        ],
      );

      const refund = inserted.rows[0];

      // Audit & Outbox events
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, reason, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, 'REFUND', $7, $8, $9)`,
        [
          pi.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          initialStatus === 'APPROVED' ? 'REFUND_REQUESTED_AND_APPROVED' : 'REFUND_REQUESTED',
          refund.id,
          input.reason,
          JSON.stringify({
            payment_intent_id: pi.id,
            booking_id: pi.booking_id,
            amount_minor: input.amount_minor,
            status: initialStatus,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'REFUND', $2, 'RefundRequested', $3)`,
        [
          pi.tenant_id,
          refund.id,
          JSON.stringify({
            refund_id: refund.id,
            payment_intent_id: pi.id,
            amount_minor: input.amount_minor,
            status: initialStatus,
          }),
        ],
      );

      await client.query('COMMIT');

      // If already approved, execute submission to PSP immediately
      if (initialStatus === 'APPROVED') {
        return this.processRefund(venueId, refund.id, reqId);
      }

      return this.mapRefundRow(refund);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async approveRefund(
    venueId: string,
    refundId: string,
    managerId: string,
    requestId?: string,
  ): Promise<RefundResultItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const rRes = await client.query<any>(
        'SELECT * FROM refunds WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [refundId, venueId],
      );
      if (rRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'REFUND_NOT_FOUND',
          'Refund record not found.',
        );
      }
      const refund = rRes.rows[0];

      if (refund.status === 'SUCCEEDED') {
        await client.query('COMMIT');
        return this.mapRefundRow(refund);
      }

      if (refund.status !== 'REQUESTED') {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'INVALID_REFUND_STATUS',
          `Cannot approve refund in status '${refund.status}'. Expected 'REQUESTED'.`,
        );
      }

      const updatedRes = await client.query<any>(
        `UPDATE refunds
            SET status = 'APPROVED', approved_by = $1, approved_at = now(), updated_at = now()
          WHERE id = $2
          RETURNING *`,
        [managerId, refundId],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, 'VENUE_MANAGER', 'REFUND_APPROVED', 'REFUND', $5, $6)`,
        [
          refund.tenant_id,
          venueId,
          reqId,
          managerId,
          refundId,
          JSON.stringify({ amount_minor: refund.amount_minor }),
        ],
      );

      await client.query('COMMIT');

      // Now process approved refund to PSP
      return this.processRefund(venueId, refundId, reqId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async processRefund(
    venueId: string,
    refundId: string,
    requestId?: string,
  ): Promise<RefundResultItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const rRes = await client.query<any>(
        'SELECT * FROM refunds WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [refundId, venueId],
      );
      if (rRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'REFUND_NOT_FOUND',
          'Refund record not found.',
        );
      }
      const refund = rRes.rows[0];

      let intentProviderRef = refund.provider_ref;
      let providerName = 'sandbox';
      if (refund.payment_intent_id) {
        const piRes = await client.query<any>(
          'SELECT provider_ref, provider FROM payment_intents WHERE id = $1',
          [refund.payment_intent_id],
        );
        if (piRes.rows.length > 0) {
          intentProviderRef = piRes.rows[0].provider_ref;
          providerName = piRes.rows[0].provider || 'sandbox';
        }
      }

      if (refund.status === 'SUCCEEDED') {
        await client.query('COMMIT');
        return this.mapRefundRow(refund);
      }

      if (!['APPROVED', 'FAILED_RETRYABLE', 'SUBMITTED'].includes(refund.status)) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'INVALID_REFUND_STATUS',
          `Cannot process refund in status '${refund.status}'. Expected 'APPROVED' or 'FAILED_RETRYABLE'.`,
        );
      }

      // Mark SUBMITTED
      await client.query(
        "UPDATE refunds SET status = 'SUBMITTED', submitted_at = now(), updated_at = now() WHERE id = $1",
        [refundId],
      );
      await client.query('COMMIT');

      // Submit to PSP outside DB transaction to prevent holding locks during network I/O
      try {
        const pspResult = await this.paymentsService.refund({
          providerRef: intentProviderRef,
          amountMinor: Number(refund.amount_minor),
          reason: refund.reason,
          idempotencyKey: `refund-psp-${refund.id}-${refund.retry_count}`,
        }, providerName);

        // Mark SUCCEEDED
        const succeededRes = await pool.query<any>(
          `UPDATE refunds
              SET status = 'SUCCEEDED', provider_ref = $1, processed_at = now(), updated_at = now()
            WHERE id = $2
            RETURNING *`,
          [pspResult.refundRef, refundId],
        );

        await pool.query(
          `INSERT INTO audit_events (
             tenant_id, venue_id, request_id, actor_id, actor_role,
             action, target_type, target_id, metadata
           ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'REFUND_SUCCEEDED', 'REFUND', $5, $6)`,
          [
            refund.tenant_id,
            venueId,
            reqId,
            refund.approved_by || refund.customer_id,
            refundId,
            JSON.stringify({
              provider_ref: pspResult.refundRef,
              amount_minor: refund.amount_minor,
            }),
          ],
        );

        await pool.query(
          `INSERT INTO outbox_events (
             tenant_id, aggregate_type, aggregate_id, event_type, payload
           ) VALUES ($1, 'REFUND', $2, 'RefundSucceeded', $3)`,
          [
            refund.tenant_id,
            refundId,
            JSON.stringify({
              refund_id: refundId,
              amount_minor: refund.amount_minor,
              provider_ref: pspResult.refundRef,
            }),
          ],
        );

        return this.mapRefundRow(succeededRes.rows[0]);
      } catch (pspErr: any) {
        const nextRetry = (refund.retry_count || 0) + 1;
        const newStatus: RefundStatus = nextRetry >= 3 ? 'MANUAL_REVIEW' : 'FAILED_RETRYABLE';
        const failureReason = pspErr?.message || 'PSP_REFUND_ERROR';

        const failedRes = await pool.query<any>(
          `UPDATE refunds
              SET status = $1, failure_reason = $2, retry_count = $3, updated_at = now()
            WHERE id = $4
            RETURNING *`,
          [newStatus, failureReason, nextRetry, refundId],
        );

        // If manual review triggered, generate an alert
        if (newStatus === 'MANUAL_REVIEW') {
          await pool.query(
            `INSERT INTO reconciliation_alerts (
               tenant_id, venue_id, alert_type, severity, message, details
             ) VALUES ($1, $2, 'STUCK_REFUND', 'HIGH', $3, $4)`,
            [
              refund.tenant_id,
              venueId,
              `Refund ${refundId} failed after ${nextRetry} attempts and requires manual review: ${failureReason}`,
              JSON.stringify({
                refund_id: refundId,
                amount_minor: refund.amount_minor,
                failure_reason: failureReason,
                retry_count: nextRetry,
              }),
            ],
          );
        }

        return this.mapRefundRow(failedRes.rows[0]);
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async retryRefund(
    venueId: string,
    refundId: string,
    managerId: string,
    requestId?: string,
  ): Promise<RefundResultItem> {
    const pool = getPool();
    const res = await pool.query<any>(
      'SELECT status FROM refunds WHERE id = $1 AND venue_id = $2',
      [refundId, venueId],
    );
    if (res.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'REFUND_NOT_FOUND', 'Refund record not found.');
    }
    const status = res.rows[0].status;
    if (status !== 'FAILED_RETRYABLE' && status !== 'MANUAL_REVIEW') {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'INVALID_REFUND_STATUS',
        `Cannot retry refund in status '${status}'. Expected 'FAILED_RETRYABLE' or 'MANUAL_REVIEW'.`,
      );
    }
    return this.processRefund(venueId, refundId, requestId);
  }

  async listRefunds(venueId: string, filter: RefundListFilter): Promise<RefundListResult> {
    const pool = getPool();
    const conditions: string[] = ['r.venue_id = $1'];
    const params: any[] = [venueId];
    let pIdx = 2;

    if (filter.status) {
      conditions.push(`r.status = $${pIdx++}`);
      params.push(filter.status);
    }
    if (filter.booking_id) {
      conditions.push(`r.booking_id = $${pIdx++}`);
      params.push(filter.booking_id);
    }
    if (filter.customer_id) {
      conditions.push(`r.customer_id = $${pIdx++}`);
      params.push(filter.customer_id);
    }
    if (filter.from) {
      conditions.push(`r.created_at >= $${pIdx++}`);
      params.push(new Date(filter.from));
    }
    if (filter.to) {
      conditions.push(`r.created_at <= $${pIdx++}`);
      params.push(new Date(filter.to));
    }

    const whereClause = conditions.join(' AND ');
    const limit = Math.min(Math.max(filter.limit || 50, 1), 100);
    const offset = Math.max((filter.page || 1) - 1, 0) * limit;

    const itemsQuery = `
      SELECT r.*, u.email as customer_email
        FROM refunds r
        LEFT JOIN users u ON u.id = r.customer_id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
    const itemsRes = await pool.query<any>(itemsQuery, params);

    const summaryQuery = `
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status = 'SUCCEEDED' THEN amount_minor ELSE 0 END), 0) as total_refunded_minor,
        COALESCE(SUM(CASE WHEN status IN ('REQUESTED', 'APPROVED', 'SUBMITTED', 'FAILED_RETRYABLE') THEN amount_minor ELSE 0 END), 0) as pending_refunds_minor,
        COUNT(CASE WHEN status = 'REQUESTED' THEN 1 END) as count_requested,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as count_approved,
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as count_submitted,
        COUNT(CASE WHEN status = 'SUCCEEDED' THEN 1 END) as count_succeeded,
        COUNT(CASE WHEN status = 'FAILED_RETRYABLE' THEN 1 END) as count_failed,
        COUNT(CASE WHEN status = 'MANUAL_REVIEW' THEN 1 END) as count_review
       FROM refunds r
      WHERE ${whereClause}
    `;
    const sumRes = await pool.query<any>(summaryQuery, params);
    const sum = sumRes.rows[0];

    return {
      refunds: itemsRes.rows.map((r) => this.mapRefundRow(r)),
      total_count: Number(sum?.total_count || 0),
      summary: {
        total_refunded_minor: Number(sum?.total_refunded_minor || 0),
        pending_refunds_minor: Number(sum?.pending_refunds_minor || 0),
        count_by_status: {
          REQUESTED: Number(sum?.count_requested || 0),
          APPROVED: Number(sum?.count_approved || 0),
          SUBMITTED: Number(sum?.count_submitted || 0),
          SUCCEEDED: Number(sum?.count_succeeded || 0),
          FAILED_RETRYABLE: Number(sum?.count_failed || 0),
          MANUAL_REVIEW: Number(sum?.count_review || 0),
        },
      },
    };
  }

  private mapRefundRow(row: any): RefundResultItem {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      booking_id: row.booking_id || null,
      payment_intent_id: row.payment_intent_id || null,
      customer_id: row.customer_id,
      customer_email: row.customer_email || null,
      amount_minor: Number(row.amount_minor),
      currency: row.currency || 'RON',
      status: row.status,
      reason: row.reason,
      provider_ref: row.provider_ref || null,
      approved_by: row.approved_by || null,
      approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      processed_at: row.processed_at ? new Date(row.processed_at).toISOString() : null,
      failure_reason: row.failure_reason || null,
      retry_count: Number(row.retry_count || 0),
      idempotency_key: row.idempotency_key || null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}
