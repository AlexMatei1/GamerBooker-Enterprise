export type VenueRole = 'OWNER' | 'VENUE_MANAGER' | 'RECEPTION' | 'BAR_STAFF';

export interface VenueInfo {
  id: string;
  name: string;
  slug: string;
  publication_state: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
  timezone: string;
}

export type ResourceStatus = 'AVAILABLE' | 'OCCUPIED' | 'BOOKED' | 'MAINTENANCE';

export interface LiveStationItem {
  id: string;
  name: string;
  type: string;
  room_name: string;
  zone_name?: string | null;
  status: ResourceStatus;
  rate_minor: number;
  current_session?: {
    booking_id: string;
    public_code: string;
    customer_name: string;
    starts_at: string;
    ends_at: string;
    minutes_remaining: number;
  } | null;
}

export interface FloorOverviewData {
  venue_id: string;
  timestamp: string;
  counts: {
    total: number;
    available: number;
    occupied: number;
    booked: number;
    maintenance: number;
  };
  stations: LiveStationItem[];
}

export interface CheckinQueueItem {
  booking_id: string;
  public_code: string;
  customer_name: string;
  resource_names: string[];
  starts_at: string;
  ends_at: string;
  due_balance_minor: number;
  payment_status: 'FULLY_PAID' | 'BALANCE_DUE';
}

export interface OrderItem {
  id: string;
  product_id: string;
  title: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  age_restricted: boolean;
}

export interface BarOrder {
  id: string;
  public_code: string;
  order_type: 'PRE_ORDER' | 'IN_SESSION';
  fulfillment_mode: 'BAR_PICKUP' | 'AT_STATION';
  status: 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'HANDED_OFF' | 'CANCELLED';
  pickup_code?: string;
  target_resource_name?: string;
  items: OrderItem[];
  total_minor: number;
  age_verification_required: boolean;
  age_verified_by?: string;
  created_at: string;
}

export interface LayoutNode {
  id: string;
  resource_id?: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layer: 'equipment' | 'furniture' | 'walls' | 'labels';
  attributes?: Record<string, any>;
}

export interface LayoutDraft {
  venue_id: string;
  revision: number;
  canvas: {
    width: number;
    height: number;
    grid_size: number;
  };
  rooms: {
    id: string;
    name: string;
    bounds: { x: number; y: number; width: number; height: number };
  }[];
  nodes: LayoutNode[];
}

export interface ReconciliationReport {
  date: string;
  opening_balance_minor: number;
  online_captured_minor: number;
  reception_cash_minor: number;
  reception_card_minor: number;
  refunds_minor: number;
  voided_offline_minor: number;
  closing_balance_minor: number;
  discrepancies_count: number;
  status: 'BALANCED' | 'DISCREPANCY_FLAGGED' | 'CLOSED';
}

export interface PolicyPreviewScenario {
  scenario_id: string;
  name: string;
  duration_minutes: number;
  players_count: number;
  total_price_minor: number;
  due_now_minor: number;
  remaining_balance_minor: number;
  per_player_share_minor?: number;
  per_player_due_now_minor?: number;
  customer_display: {
    price_formatted: string;
    due_now_formatted: string;
    balance_formatted: string;
    free_cancellation_text: string;
    settlement_options_text: string;
  };
}
