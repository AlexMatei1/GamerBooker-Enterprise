export interface CancelPolicyResult {
  booking_id: string;
  status: 'CANCELLED';
  cancellation_type: 'FREE' | 'LATE_WITH_PENALTY';
  paid_minor: number;
  penalty_minor: number;
  refundable_minor: number;
  refund_id?: string | null;
  cancelled_at: string;
}

export interface RescheduleInput {
  new_hold_id: string;
  expected_version: number;
  reason?: string;
}

export interface RescheduleResult {
  booking_id: string;
  status: 'CONFIRMED';
  starts_at: string;
  ends_at: string;
  resource_ids: string[];
  atomic_resource_ids: string[];
  total_minor: number;
  due_now_minor: number;
  paid_minor: number;
  balance_minor: number;
  delta_total_minor: number;
  delta_due_now_minor: number;
  refund_id?: string | null;
  version: number;
  rescheduled_at: string;
}

export interface ExtendSessionInput {
  additional_minutes: number;
  expected_version: number;
}

export interface ExtendSessionResult {
  booking_id: string;
  previous_ends_at: string;
  new_ends_at: string;
  extension_minutes: number;
  extension_cost_minor: number;
  new_total_minor: number;
  new_paid_minor: number;
  new_balance_minor: number;
  version: number;
  extended_at: string;
}

export interface NoShowVerificationInput {
  staff_verified_empty: boolean;
  expected_version: number;
  notes?: string;
}

export interface NoShowResult {
  booking_id: string;
  status: 'NO_SHOW';
  forfeited_minor: number;
  refundable_minor: number;
  refund_id?: string | null;
  staff_id: string;
  verified_at: string;
}
