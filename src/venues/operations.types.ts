export interface ActiveBookingSummary {
  booking_id: string;
  public_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  customer_name?: string;
  customer_email_masked?: string;
  total_minor: number;
  balance_minor: number;
}

export interface ActiveMaintenanceSummary {
  maintenance_id: string;
  reason: string;
  starts_at: string;
  ends_at: string;
}

export interface LiveFloorResource {
  resource_id: string;
  name: string;
  type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  room_id: string | null;
  zone_id: string | null;
  room_name: string | null;
  zone_name: string | null;
  attributes: Record<string, unknown>;
  current_status: 'AVAILABLE' | 'BOOKED' | 'OCCUPIED' | 'MAINTENANCE' | 'TEMP_BLOCKED';
  active_booking?: ActiveBookingSummary | null;
  active_maintenance?: ActiveMaintenanceSummary | null;
}

export interface LiveFloorResult {
  venue_id: string;
  timestamp: string;
  summary: {
    total_resources: number;
    available: number;
    booked: number;
    occupied: number;
    maintenance: number;
    temp_blocked: number;
  };
  resources: LiveFloorResource[];
}

export interface CalendarBookingItem {
  booking_id: string;
  public_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  resource_ids: string[];
  resource_names: string[];
  customer: {
    user_id: string;
    email_masked: string;
  };
  prepaid_mode: string;
  paid_minor: number;
  total_minor: number;
  balance_minor: number;
}

export interface CalendarResult {
  from: string;
  to: string;
  summary: {
    total_bookings: number;
    confirmed_count: number;
    checked_in_count: number;
    completed_count: number;
    cancelled_count: number;
    no_show_count: number;
    total_revenue_minor: number;
    outstanding_balance_minor: number;
  };
  bookings: CalendarBookingItem[];
}

export interface CheckinQueueItem {
  booking_id: string;
  public_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  customer: {
    user_id: string;
    email_masked: string;
  };
  resources: Array<{ id: string; name: string; type: string }>;
  balance_minor: number;
  is_paid_in_full: boolean;
  is_ready_for_checkin: boolean;
}

export interface CreateMaintenanceBlockDto {
  reason: string;
  starts_at: string;
  ends_at: string;
}

export interface MaintenanceBlockDetail {
  id: string;
  venue_id: string;
  tenant_id: string;
  resource_id: string;
  resource_name: string;
  created_by_user_id: string;
  reason: string;
  starts_at: string;
  ends_at: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
}
