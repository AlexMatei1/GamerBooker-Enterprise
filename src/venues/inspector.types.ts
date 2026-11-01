export interface ResourcePricingSummary {
  hourly_rate_minor: number;
  source: 'RESOURCE' | 'ZONE' | 'VENUE_DEFAULT' | 'PLATFORM_DEFAULT';
  currency: string;
}

export interface ResourcePolicySummary {
  profile_id: string | null;
  profile_name: string | null;
  cancellation_cutoff_hours: number;
  deposit_percentage: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
}

export interface ResourceComponentSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  bookable?: boolean;
}

export interface ResourceParentSummary {
  id: string;
  name: string;
  type: string;
}

export interface ResourceAdjacencyNeighbor {
  edge_id: string;
  neighbor_resource_id: string;
  neighbor_name: string;
  neighbor_type: string;
  distance_metric: number;
}

export interface ResourceInspectorDetail {
  id: string;
  venue_id: string;
  name: string;
  type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  status: string;
  bookable: boolean;
  room: { id: string | null; name: string | null };
  zone: { id: string | null; name: string | null };
  attributes: Record<string, any>;
  pricing: ResourcePricingSummary;
  policy: ResourcePolicySummary;
  components: {
    is_composite: boolean;
    child_resources: ResourceComponentSummary[];
    parent_resources: ResourceParentSummary[];
  };
  adjacencies: ResourceAdjacencyNeighbor[];
}

export interface UpdateInspectorDto {
  name?: string;
  room_id?: string | null;
  zone_id?: string | null;
  status?: string;
  bookable?: boolean;
  attributes?: Record<string, any>;
}

export interface AdjacencyEdgeItem {
  id: string;
  venue_id: string;
  resource_a_id: string;
  resource_a_name: string;
  resource_b_id: string;
  resource_b_name: string;
  distance_metric: number;
  created_at: string;
}

export interface CreateAdjacencyDto {
  resource_a_id: string;
  resource_b_id: string;
  distance_metric?: number;
}

export interface SuggestedAdjacency {
  resource_a_id: string;
  resource_a_name: string;
  resource_b_id: string;
  resource_b_name: string;
  euclidean_distance: number;
  suggested_distance_metric: number;
  room_id: string;
  already_adjacent: boolean;
}

export interface PrivateRoomCompositionDetail {
  room_resource_id: string;
  room_name: string;
  total_components: number;
  components: ResourceComponentSummary[];
}

export interface UpdateCompositionDto {
  child_resource_ids: string[];
}
