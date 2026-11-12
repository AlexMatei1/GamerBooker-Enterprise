import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  DailyReconciliationResult,
  CloseDailyReportInput,
  ReconciliationAlertItem,
  AcknowledgeAlertInput,
} from './refunds.types';

interface OrphanIntentRow {
  id: string;
  amount_minor: string | number;
  provider_ref: string;
}

interface StuckRefundRow {
  id: string;
  amount_minor: string | number;
  status: 'SUBMITTED' | 'FAILED_RETRYABLE' | 'MANUAL_REVIEW';
  retry_count: string | number | null;
  failure_reason: string | null;
}

interface ReconciliationReportRow {
  id: string;
  venue_id: string;
  opening_balance_minor: string | number;
  online_captures_minor: string | number;
  online_refunds_minor: string | number;
  net_online_minor: string | number;
  reception_cash_minor: string | number;
  reception_card_minor: string | number;
  voided_offline_minor: string | number;
  total_collected_minor: string | number;
  closing_balance_minor: string | number;
  discrepancy_count: string | number;
  anomalies: DailyReconciliationResult['anomalies'] | null;
  status: DailyReconciliationResult['status'];
  closed_by: string | null;
  closed_at: string | Date | null;
  notes: string | null;
  created_at: string | Date;
}

interface ReconciliationAlertRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  alert_type: ReconciliationAlertItem['alert_type'];
  severity: ReconciliationAlertItem['severity'];
  message: string;
  details: Record<string, unknown> | null;
  acknowledged_at: string | Date | null;
  acknowledged_by: string | null;
  acknowledgement_note: string | null;
  created_at: string | Date;
}

@Injectable()
export class ReconciliationService {
  async generateDailyReport(
    venueId: string,
    dateStr: string,
    _staffId?: string,
  ): Promise<DailyReconciliationResult> {
    const pool = getPool();

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATE_FORMAT',
        'Date must be in YYYY-MM-DD format.',
      );
    }

    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    // 1. Resolve venue tenant_id
    const vRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (vRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
    }
    const tenantId = vRes.rows[0].tenant_id;

    // 2. Resolve opening balance (closing balance of previous day)
    const prevDate = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const prevReportRes = await pool.query<{ closing_balance_minor: string }>(
      'SELECT closing_balance_minor FROM reconciliation_reports WHERE venue_id = $1 AND report_date = $2',
      [venueId, prevDate],
    );
    const openingBalanceMinor = Number(prevReportRes.rows[0]?.closing_balance_minor || 0);

    // 3. Online captures (payment_intents)
    const capRes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) as total
         FROM payment_intents
        WHERE venue_id = $1
          AND status = 'CAPTURED'
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    const onlineCapturesMinor = Number(capRes.rows[0]?.total || 0);

    // 4. Online refunds (refunds where status = 'SUCCEEDED')
    const refRes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) as total
         FROM refunds
        WHERE venue_id = $1
          AND status = 'SUCCEEDED'
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    const onlineRefundsMinor = Number(refRes.rows[0]?.total || 0);
    const netOnlineMinor = onlineCapturesMinor - onlineRefundsMinor;

    // 5. Reception cash receipts (offline_receipts where payment_method = 'CASH' and voided_at IS NULL)
    const cashRes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) as total
         FROM offline_receipts
        WHERE venue_id = $1
          AND voided_at IS NULL
          AND payment_method = 'CASH'
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    const receptionCashMinor = Number(cashRes.rows[0]?.total || 0);

    // 6. Reception card/POS receipts
    const cardRes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) as total
         FROM offline_receipts
        WHERE venue_id = $1
          AND voided_at IS NULL
          AND payment_method != 'CASH'
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    const receptionCardMinor = Number(cardRes.rows[0]?.total || 0);

    // 7. Voided offline receipts
    const voidRes = await pool.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) as total, COUNT(*) as count
         FROM offline_receipts
        WHERE venue_id = $1
          AND voided_at IS NOT NULL
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    const voidedOfflineMinor = Number(voidRes.rows[0]?.total || 0);
    const voidedCount = Number(voidRes.rows[0]?.count || 0);

    // Calculated totals
    const totalCollectedMinor = netOnlineMinor + receptionCashMinor + receptionCardMinor;
    const closingBalanceMinor = openingBalanceMinor + totalCollectedMinor;

    // 8. Anomaly detection
    const anomalies: Array<{
      type: string;
      severity: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Anomaly A: Orphan intents (captured without linked booking or group booking)
    const orphanRes = await pool.query<OrphanIntentRow>(
      `SELECT id, amount_minor, provider_ref
         FROM payment_intents
        WHERE venue_id = $1
          AND status = 'CAPTURED'
          AND booking_id IS NULL
          AND group_booking_id IS NULL
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    for (const orphan of orphanRes.rows) {
      anomalies.push({
        type: 'ORPHAN_INTENT',
        severity: 'MEDIUM',
        message: `Captured payment intent ${orphan.id} (${orphan.provider_ref}) has no linked booking or group booking.`,
        details: { intent_id: orphan.id, amount_minor: Number(orphan.amount_minor) },
      });
    }

    // Anomaly B: Stuck refunds
    const stuckRes = await pool.query<StuckRefundRow>(
      `SELECT id, amount_minor, status, retry_count, failure_reason
         FROM refunds
        WHERE venue_id = $1
          AND status IN ('SUBMITTED', 'FAILED_RETRYABLE', 'MANUAL_REVIEW')
          AND created_at >= $2 AND created_at <= $3`,
      [venueId, startOfDay, endOfDay],
    );
    for (const stuck of stuckRes.rows) {
      anomalies.push({
        type: 'STUCK_REFUND',
        severity: stuck.status === 'MANUAL_REVIEW' ? 'HIGH' : 'MEDIUM',
        message: `Refund ${stuck.id} is pending in status '${stuck.status}' (retries: ${Number(stuck.retry_count ?? 0)}).`,
        details: {
          refund_id: stuck.id,
          status: stuck.status,
          retry_count: stuck.retry_count,
          failure_reason: stuck.failure_reason,
        },
      });
    }

    // Anomaly C: High void volume
    const grossOffline = receptionCashMinor + receptionCardMinor + voidedOfflineMinor;
    if (voidedCount >= 3 || (grossOffline > 0 && voidedOfflineMinor / grossOffline > 0.2)) {
      anomalies.push({
        type: 'HIGH_VOID_VOLUME',
        severity: 'HIGH',
        message: `High volume of voided reception receipts: ${voidedCount} voids totaling ${voidedOfflineMinor} minor units.`,
        details: { voided_count: voidedCount, voided_minor: voidedOfflineMinor, gross_offline: grossOffline },
      });
    }

    // Record alerts for anomalies that haven't been alerted yet
    for (const a of anomalies) {
      const existingAlert = await pool.query(
        'SELECT id FROM reconciliation_alerts WHERE venue_id = $1 AND alert_type = $2 AND message = $3',
        [venueId, a.type, a.message],
      );
      if (existingAlert.rows.length === 0) {
        await pool.query(
          `INSERT INTO reconciliation_alerts (
             tenant_id, venue_id, alert_type, severity, message, details
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, venueId, a.type, a.severity, a.message, JSON.stringify(a.details || {})],
        );
      }
    }

    const reportStatus = anomalies.length > 0 ? 'DISCREPANCY_FLAGGED' : 'GENERATED';

    // Upsert into reconciliation_reports
    const upsertRes = await pool.query<ReconciliationReportRow>(
      `INSERT INTO reconciliation_reports (
         tenant_id, venue_id, report_date, opening_balance_minor, online_captures_minor,
         online_refunds_minor, net_online_minor, reception_cash_minor, reception_card_minor,
         voided_offline_minor, total_collected_minor, closing_balance_minor,
         discrepancy_count, anomalies, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
       ON CONFLICT (venue_id, report_date) DO UPDATE SET
         opening_balance_minor = EXCLUDED.opening_balance_minor,
         online_captures_minor = EXCLUDED.online_captures_minor,
         online_refunds_minor = EXCLUDED.online_refunds_minor,
         net_online_minor = EXCLUDED.net_online_minor,
         reception_cash_minor = EXCLUDED.reception_cash_minor,
         reception_card_minor = EXCLUDED.reception_card_minor,
         voided_offline_minor = EXCLUDED.voided_offline_minor,
         total_collected_minor = EXCLUDED.total_collected_minor,
         closing_balance_minor = EXCLUDED.closing_balance_minor,
         discrepancy_count = EXCLUDED.discrepancy_count,
         anomalies = EXCLUDED.anomalies,
         status = CASE WHEN reconciliation_reports.status = 'RECONCILED' THEN 'RECONCILED' ELSE EXCLUDED.status END,
         updated_at = now()
       RETURNING *`,
      [
        tenantId,
        venueId,
        dateStr,
        openingBalanceMinor,
        onlineCapturesMinor,
        onlineRefundsMinor,
        netOnlineMinor,
        receptionCashMinor,
        receptionCardMinor,
        voidedOfflineMinor,
        totalCollectedMinor,
        closingBalanceMinor,
        anomalies.length,
        JSON.stringify(anomalies),
        reportStatus,
      ],
    );

    const report = upsertRes.rows[0];

    return {
      id: report.id,
      venue_id: report.venue_id,
      report_date: dateStr,
      opening_balance_minor: Number(report.opening_balance_minor),
      online_captures_minor: Number(report.online_captures_minor),
      online_refunds_minor: Number(report.online_refunds_minor),
      net_online_minor: Number(report.net_online_minor),
      reception_cash_minor: Number(report.reception_cash_minor),
      reception_card_minor: Number(report.reception_card_minor),
      voided_offline_minor: Number(report.voided_offline_minor),
      total_collected_minor: Number(report.total_collected_minor),
      closing_balance_minor: Number(report.closing_balance_minor),
      discrepancy_count: Number(report.discrepancy_count),
      anomalies: report.anomalies || [],
      status: report.status,
      closed_by: report.closed_by || null,
      closed_at: report.closed_at ? new Date(report.closed_at).toISOString() : null,
      notes: report.notes || null,
      created_at: new Date(report.created_at).toISOString(),
    };
  }

  async getDailyReport(venueId: string, dateStr: string): Promise<DailyReconciliationResult> {
    return this.generateDailyReport(venueId, dateStr);
  }

  async closeDailyReport(
    venueId: string,
    dateStr: string,
    managerId: string,
    input?: CloseDailyReportInput,
  ): Promise<DailyReconciliationResult> {
    const pool = getPool();
    // Ensure report exists
    await this.generateDailyReport(venueId, dateStr, managerId);

    const updatedRes = await pool.query<ReconciliationReportRow>(
      `UPDATE reconciliation_reports
          SET status = 'RECONCILED', closed_by = $1, closed_at = now(), notes = $2, updated_at = now()
        WHERE venue_id = $3 AND report_date = $4
        RETURNING *`,
      [managerId, input?.notes || 'Reconciliation reviewed and approved by venue management.', venueId, dateStr],
    );

    if (updatedRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'REPORT_NOT_FOUND', 'Report not found.');
    }

    const report = updatedRes.rows[0];
    return {
      id: report.id,
      venue_id: report.venue_id,
      report_date: dateStr,
      opening_balance_minor: Number(report.opening_balance_minor),
      online_captures_minor: Number(report.online_captures_minor),
      online_refunds_minor: Number(report.online_refunds_minor),
      net_online_minor: Number(report.net_online_minor),
      reception_cash_minor: Number(report.reception_cash_minor),
      reception_card_minor: Number(report.reception_card_minor),
      voided_offline_minor: Number(report.voided_offline_minor),
      total_collected_minor: Number(report.total_collected_minor),
      closing_balance_minor: Number(report.closing_balance_minor),
      discrepancy_count: Number(report.discrepancy_count),
      anomalies: report.anomalies || [],
      status: report.status,
      closed_by: report.closed_by || null,
      closed_at: report.closed_at ? new Date(report.closed_at).toISOString() : null,
      notes: report.notes || null,
      created_at: new Date(report.created_at).toISOString(),
    };
  }

  async listAlerts(
    venueId: string,
    statusFilter: 'OPEN' | 'ACKNOWLEDGED' | 'ALL' = 'ALL',
  ): Promise<{ alerts: ReconciliationAlertItem[]; total_count: number }> {
    const pool = getPool();
    const conditions: string[] = ['venue_id = $1'];
    const params: unknown[] = [venueId];

    if (statusFilter === 'OPEN') {
      conditions.push('acknowledged_at IS NULL');
    } else if (statusFilter === 'ACKNOWLEDGED') {
      conditions.push('acknowledged_at IS NOT NULL');
    }

    const whereClause = conditions.join(' AND ');
    const res = await pool.query<ReconciliationAlertRow>(
      `SELECT * FROM reconciliation_alerts
        WHERE ${whereClause}
        ORDER BY created_at DESC`,
      params,
    );

    return {
      alerts: res.rows.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        venue_id: r.venue_id,
        alert_type: r.alert_type,
        severity: r.severity,
        message: r.message,
        details: r.details || {},
        acknowledged_at: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
        acknowledged_by: r.acknowledged_by || null,
        acknowledgement_note: r.acknowledgement_note || null,
        created_at: new Date(r.created_at).toISOString(),
      })),
      total_count: res.rows.length,
    };
  }

  async acknowledgeAlert(
    venueId: string,
    alertId: string,
    managerId: string,
    input?: AcknowledgeAlertInput,
  ): Promise<ReconciliationAlertItem> {
    const pool = getPool();
    const res = await pool.query<ReconciliationAlertRow>(
      `UPDATE reconciliation_alerts
          SET acknowledged_at = now(), acknowledged_by = $1, acknowledgement_note = $2
        WHERE id = $3 AND venue_id = $4
        RETURNING *`,
      [managerId, input?.note || 'Acknowledged', alertId, venueId],
    );

    if (res.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ALERT_NOT_FOUND', 'Alert not found.');
    }

    const r = res.rows[0];
    return {
      id: r.id,
      tenant_id: r.tenant_id,
      venue_id: r.venue_id,
      alert_type: r.alert_type,
      severity: r.severity,
      message: r.message,
      details: r.details || {},
      acknowledged_at: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
      acknowledged_by: r.acknowledged_by || null,
      acknowledgement_note: r.acknowledgement_note || null,
      created_at: new Date(r.created_at).toISOString(),
    };
  }
}
