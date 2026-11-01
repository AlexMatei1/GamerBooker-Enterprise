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
