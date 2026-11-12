export type RefundStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'MANUAL_REVIEW';

export interface RequestRefundInput {
  payment_intent_id?: string;
  booking_id?: string;
  customer_id?: string;
  amount_minor: number;
  reason: string;
  idempotency_key?: string;
  requires_approval?: boolean;
}

export interface RefundResultItem {
  id: string;
  tenant_id: string;
  venue_id: string;
  booking_id: string | null;
  payment_intent_id: string | null;
  customer_id: string;
  customer_email?: string | null;
  amount_minor: number;
  currency: string;
  status: RefundStatus;
  reason: string;
  provider_ref: string | null;
  approved_by: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  processed_at: string | null;
  failure_reason: string | null;
  retry_count: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundListFilter {
  status?: RefundStatus;
  booking_id?: string;
  customer_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface RefundListResult {
  refunds: RefundResultItem[];
  total_count: number;
  summary: {
    total_refunded_minor: number;
    pending_refunds_minor: number;
    count_by_status: Record<string, number>;
  };
}

export interface DailyReconciliationResult {
  id?: string;
  venue_id: string;
  report_date: string;
  opening_balance_minor: number;
  online_captures_minor: number;
  online_refunds_minor: number;
  net_online_minor: number;
  reception_cash_minor: number;
  reception_card_minor: number;
  voided_offline_minor: number;
  total_collected_minor: number;
  closing_balance_minor: number;
  discrepancy_count: number;
  anomalies: Array<{
    type: string;
    severity: string;
    message: string;
    details?: unknown;
  }>;
  status: 'GENERATED' | 'RECONCILED' | 'DISCREPANCY_FLAGGED';
  closed_by?: string | null;
  closed_at?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface CloseDailyReportInput {
  notes?: string;
}

export type AlertType =
  | 'STUCK_REFUND'
  | 'DISCREPANCY_DETECTED'
  | 'HIGH_VOID_VOLUME'
  | 'ORPHAN_INTENT'
  | 'OVER_REFUND_ATTEMPT';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReconciliationAlertItem {
  id: string;
  tenant_id: string;
  venue_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledgement_note: string | null;
  created_at: string;
}

export interface AcknowledgeAlertInput {
  note?: string;
}
