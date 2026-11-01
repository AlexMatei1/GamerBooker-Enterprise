import type { VenueRole } from '../auth/membership.service';

export interface StepDetails {
  completed: boolean;
  name: string;
  timezone: string;
  has_address: boolean;
  has_contact: boolean;
}

export interface StepRoomsZones {
  completed: boolean;
  room_count: number;
  zone_count: number;
}

export interface StepResources {
  completed: boolean;
  resource_count: number;
  bookable_count: number;
}

export interface StepSchedules {
  completed: boolean;
  schedule_count: number;
}

export interface StepPricingPolicies {
  completed: boolean;
  has_default_policy: boolean;
  has_price_rule: boolean;
}

export interface StepStaff {
  completed: boolean;
  staff_count: number;
}

export interface WizardProgress {
  venue_id: string;
  step_details: StepDetails;
  step_rooms_zones: StepRoomsZones;
  step_resources: StepResources;
  step_schedules: StepSchedules;
  step_pricing_policies: StepPricingPolicies;
  step_staff: StepStaff;
  publication_state: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
  is_complete: boolean;
}

export interface PublishGatesResult {
  can_publish: boolean;
  current_state: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
  gates: {
    has_bookable_resource: boolean;
    has_operating_schedule: boolean;
    has_policy_profile: boolean;
    has_price_rule: boolean;
    has_staff: boolean;
  };
  missing_requirements: string[];
}

export interface StaffInvitationRow {
  id: string;
  venue_id: string;
  tenant_id: string;
  email: string;
  role: VenueRole;
  token_hash: Buffer;
  invited_by_user_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StaffInvitationSummary {
  id: string;
  venue_id: string;
  tenant_id: string;
  email: string;
  role: VenueRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface StaffInvitationCreatedResult {
  id: string;
  venue_id: string;
  tenant_id: string;
  email: string;
  role: VenueRole;
  expires_at: string;
  token: string;
}
