export type GroupBookingMode = 'ORGANIZER_PAYS_ALL' | 'SPLIT_BY_PARTICIPANT';

export type GroupBookingStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENTS'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export type ParticipantStatus =
  | 'INVITED'
  | 'ACCEPTED'
  | 'PAYING'
  | 'PAID'
  | 'DECLINED'
  | 'EXPIRED';

export interface CreateParticipantInput {
  email?: string;
  assigned_resource_id?: string;
}

export interface CreateGroupBookingDto {
  quote_id: string;
  mode: GroupBookingMode;
  participants?: CreateParticipantInput[]; // in addition to organizer
}

export interface ParticipantShareInput {
  participant_id: string;
  share_due_now_minor: number;
  share_total_minor: number;
}

export interface AdjustSharesDto {
  shares: ParticipantShareInput[];
}

export interface GroupParticipantDetail {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  invitation_token: string | null;
  is_organizer: boolean;
  assigned_resource_id: string | null;
  share_total_minor: number;
  share_due_now_minor: number;
  share_balance_minor: number;
  share_paid_minor: number;
  status: ParticipantStatus;
  token_expires_at: string;
  accepted_at: string | null;
}

/**
 * A `timestamptz` column as `pg` hands it back: a `Date` for a real column,
 * but an ISO string when a query aliases/casts it to text (`expires_at as
 * group_expires_at`) or when a test double supplies the row directly.
 */
export type PgTimestamp = Date | string;

export interface GroupBookingRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  organizer_id: string;
  quote_id: string;
  hold_id: string | null;
  booking_id: string | null;
  mode: GroupBookingMode;
  status: GroupBookingStatus;
  total_minor: string;
  due_now_minor: string;
  balance_minor: string;
  currency: string;
  expires_at: PgTimestamp;
  created_at: PgTimestamp;
}

/** `group_participants` on its own: exactly the columns of that table. */
export interface GroupParticipantRow {
  id: string;
  group_booking_id: string;
  user_id: string | null;
  invited_email: string | null;
  invitation_token: string | null;
  is_organizer: boolean;
  assigned_resource_id: string | null;
  share_total_minor: string;
  share_due_now_minor: string;
  share_balance_minor: string;
  share_paid_minor: string;
  status: ParticipantStatus;
  token_expires_at: PgTimestamp;
  accepted_at: PgTimestamp | null;
  created_at: PgTimestamp;
  updated_at: PgTimestamp;
}

/**
 * `group_participants` joined to `group_bookings` for tenant/venue scoping.
 * Tenant and venue live on the group row, never on the participant row.
 */
export interface GroupParticipantWithGroupRow extends GroupParticipantRow {
  tenant_id: string;
  venue_id: string;
}

/** Same join, additionally exposing the group's expiry for TTL checks. */
export interface GroupParticipantInvitationRow extends GroupParticipantWithGroupRow {
  group_expires_at: PgTimestamp;
}

export interface GroupBookingDetail {
  id: string;
  tenant_id: string;
  venue_id: string;
  organizer_id: string;
  quote_id: string;
  hold_id: string | null;
  booking_id: string | null;
  mode: GroupBookingMode;
  status: GroupBookingStatus;
  total_minor: number;
  due_now_minor: number;
  balance_minor: number;
  currency: string;
  expires_at: string;
  participants: GroupParticipantDetail[];
  all_participants_accepted: boolean;
  created_at: string;
}

export interface InitiateCheckoutResult {
  group_booking: GroupBookingDetail;
  hold_id: string;
  expires_at: string;
}

export interface GroupPaymentIntentResult {
  intent_id: string;
  provider_ref: string;
  client_secret?: string;
  amount_minor: number;
  currency: string;
  participant_id: string;
  group_booking_id: string;
  status: string;
}

export interface PaymentCaptureResult {
  confirmed: boolean;
  group_booking_id: string;
  booking_id?: string;
  public_code?: string;
  refunded?: boolean;
  reason?: string;
  all_due_paid: boolean;
  total_paid_minor: number;
  due_now_minor: number;
}

export interface ExpireGroupBookingResult {
  group_booking_id: string;
  expired: boolean;
  refunded_count: number;
  refunded_total_minor: number;
}

export interface DifferenceSummaryParticipant {
  participant_id: string;
  invited_email: string | null;
  is_organizer: boolean;
  assigned_resource_id: string | null;
  share_due_now_minor: number;
  share_paid_minor: number;
  unpaid_share_minor: number;
  status: ParticipantStatus;
}

export interface DifferenceSummaryResult {
  group_booking_id: string;
  total_minor: number;
  due_now_minor: number;
  total_paid_minor: number;
  outstanding_difference_minor: number;
  is_fully_paid: boolean;
  hold_expires_at: string | null;
  seconds_remaining: number;
  unpaid_participants: DifferenceSummaryParticipant[];
  paid_participants: DifferenceSummaryParticipant[];
}

export interface PayDifferenceResult {
  intent_id: string;
  provider_ref: string;
  client_secret?: string;
  amount_minor: number;
  currency: string;
  status: string;
  group_booking_id: string;
}
