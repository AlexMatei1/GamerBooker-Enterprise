export type DevicePlatform = 'IOS' | 'ANDROID' | 'DESKTOP_WEB' | 'OTHER';

export type FunnelMilestone =
  | 'SCANNED'
  | 'STORE_REDIRECTED'
  | 'APP_OPENED'
  | 'DEFERRED_LINK_RESOLVED'
  | 'BOOKING_STARTED'
  | 'BOOKING_COMPLETED';

export interface DeepLinkResolveQuery {
  venue_id?: string;
  zone_id?: string;
  package_id?: string;
  source_tag?: string;
  session_id?: string;
  redirect?: boolean;
}

export interface DeepLinkResolveResult {
  platform: DevicePlatform;
  app_url: string;
  store_url: string;
  web_landing_url: string;
  target_redirect_url: string;
  deferred_token?: string;
  web_checkout_permitted: false;
  notice: string;
  venue_details?: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface CreateDeferredLinkInput {
  venue_id: string;
  zone_id?: string;
  package_id?: string;
  metadata?: Record<string, any>;
  ttl_seconds?: number;
}

export interface DeferredLinkResult {
  token: string;
  venue_id: string;
  zone_id?: string | null;
  package_id?: string | null;
  metadata: Record<string, any>;
  expires_at: string;
  consumed: boolean;
}

export interface RecordFunnelEventInput {
  venue_id: string;
  session_id: string;
  milestone: FunnelMilestone;
  platform?: DevicePlatform;
  source_tag?: string;
}

export interface FunnelAnalyticsSummary {
  venue_id: string;
  total_scans: number;
  store_redirects: number;
  app_opens: number;
  deferred_links_resolved: number;
  bookings_started: number;
  bookings_completed: number;
  conversion_rate_percent: number;
  by_platform: Record<string, number>;
}

export interface AccessibleResourceItem {
  id: string;
  name: string;
  type: string;
  status: string;
  status_label: string;
  status_token: 'AVAILABLE_FOR_BOOKING' | 'CURRENTLY_BOOKED' | 'UNDER_MAINTENANCE' | 'OUT_OF_ORDER';
  contrast_color_token: string;
  hourly_rate_minor: number;
  formatted_price: string;
  hardware_specs?: Record<string, any>;
  aria_label: string;
  voiceover_text: string;
}

export interface AccessibleZone {
  id: string;
  name: string;
  description?: string;
  resource_count: number;
  available_count: number;
  resources: AccessibleResourceItem[];
}

export interface AccessibleRoom {
  id: string;
  name: string;
  zones: AccessibleZone[];
}

export interface AccessibleLayoutView {
  venue_id: string;
  venue_name: string;
  total_stations: number;
  available_stations: number;
  rooms: AccessibleRoom[];
  accessibility_statement: string;
}
