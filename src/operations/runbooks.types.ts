export interface RunbookR1DoubleBookingAuditResult {
  resource_id: string;
  query_interval: { from: string; to: string };
  allegation_verified: boolean;
  overlaps_found: number;
  active_claims: Array<{
    claim_id: string;
    holder_id: string;
    hold_id: string | null;
    booking_id: string | null;
    public_code: string | null;
    slot_start: string;
    slot_end: string;
    state: string;
  }>;
  physical_squatting_suspected: boolean;
  remediation_guidance: string;
}

export interface RunbookR2OrphanPaymentInput {
  provider_ref: string;
  action: 'AUDIT' | 'REFUND' | 'RECONCILE';
  refund_reason?: string;
}

export interface RunbookR2OrphanPaymentResult {
  intent_id: string;
  provider_ref: string;
  amount_minor: number;
  status: string;
  linked_booking_id: string | null;
  linked_group_booking_id: string | null;
  orphan: boolean;
  action_taken: 'NONE' | 'REFUND_DISPATCHED' | 'STATE_RECONCILED';
  refund_id?: string;
  notes: string;
}

export interface RunbookR3ReceivableAuditResult {
  venue_id: string;
  date: string;
  booking_total_minor: number;
  online_captured_minor: number;
  reception_cash_minor: number;
  reception_card_minor: number;
  voided_offline_minor: number;
  unreconciled_delta_minor: number;
  balanced: boolean;
  notes: string;
}

export interface RunbookR4PublishDiagnosticsResult {
  venue_id: string;
  publishable: boolean;
  draft_exists: boolean;
  revision: number;
  blocking_issues: string[];
  warnings: string[];
  equipment_counts: {
    total_resources: number;
    bookable_resources: number;
    rooms_count: number;
    zones_count: number;
  };
}

export interface RunbookR5OfflineContingencyResult {
  mode: 'OFFLINE_CONTINGENCY';
  system_invariant: 'STRICT_APP_ONLY_NO_STAFF_BYPASS';
  instructions: string[];
  offline_qr_verification_steps: string[];
  prohibited_actions: string[];
}

export interface RunbookR6OutOfStockInput {
  venue_id: string;
  product_id: string;
  action: 'PAUSE' | 'CANCEL_PENDING_ITEMS';
  reason?: string;
}

export interface RunbookR6OutOfStockResult {
  product_id: string;
  product_title: string;
  action_taken: string;
  active_before: boolean;
  active_after: boolean;
  affected_orders_count: number;
  cancelled_items_count: number;
  refunds_issued_count: number;
  total_refunded_minor: number;
}

export interface TrainingModule {
  id: string;
  title: string;
  role: 'OWNER' | 'VENUE_MANAGER' | 'RECEPTION' | 'BAR_STAFF';
  required_for_launch: boolean;
  description: string;
  learning_objectives: string[];
}

export interface StaffCertificationRecord {
  id: string;
  tenant_id: string;
  venue_id: string;
  user_id: string;
  user_email?: string;
  module_id: string;
  certified_at: string;
  score: number;
}

export interface VenueStaffReadinessResult {
  venue_id: string;
  total_staff: number;
  certified_staff: number;
  readiness_percentage: number;
  ready_for_launch: boolean;
  certifications: StaffCertificationRecord[];
  missing_certifications: Array<{
    user_id: string;
    role: string;
    missing_module_id: string;
  }>;
}

export interface PilotMetricsSummary {
  venue_id: string;
  period: { from: string; to: string };
  kpis: {
    booking_conversion_rate: number;
    double_booking_rate: number;
    unresolved_payment_mismatches: number;
    split_payment_success_rate: number;
    no_show_rate: number;
    menu_attachment_rate: number;
    qr_checkin_success_rate: number;
    median_staff_intake_seconds: number;
    total_confirmed_bookings: number;
    total_revenue_minor: number;
  };
}

export interface GoNoGoGateResult {
  gate: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface GoNoGoDecisionResult {
  venue_id: string;
  decision: 'GO' | 'NO_GO';
  evaluated_at: string;
  gates_passed: number;
  gates_total: number;
  gates: GoNoGoGateResult[];
}
