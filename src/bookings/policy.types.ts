export interface PolicySettings {
  prepaid_mode: 'FULL' | 'DEPOSIT';
  deposit_percentage: number; // 10..100
  deposit_mode_settlement: 'ONLINE_ONLY' | 'RECEPTION_ONLY' | 'ONLINE_OR_RECEPTION';
  min_duration_minutes: number; // e.g. 60
  max_duration_minutes: number; // e.g. 480
  slot_granularity_minutes: number; // 15, 30, 60
  buffer_after_minutes: number; // 0, 15, 30
  free_cancellation_hours: number; // e.g. 3
  late_cancellation_penalty_percent: number; // 0..100
  no_show_grace_minutes: number; // e.g. 15
}

export const DEFAULT_PLATFORM_POLICY: PolicySettings = {
  prepaid_mode: 'DEPOSIT',
  deposit_percentage: 40,
  deposit_mode_settlement: 'ONLINE_OR_RECEPTION',
  min_duration_minutes: 60,
  max_duration_minutes: 480,
  slot_granularity_minutes: 30,
  buffer_after_minutes: 0,
  free_cancellation_hours: 3,
  late_cancellation_penalty_percent: 20,
  no_show_grace_minutes: 15,
};

export interface EffectivePolicy {
  venue_id: string;
  resource_id?: string;
  source_level: 'resource_override' | 'zone_policy' | 'venue_default' | 'platform_default';
  profile_id?: string;
  version: number;
  settings: PolicySettings;
}

export interface PolicySnapshot {
  snapshot_version: number;
  captured_at: string; // ISO-8601 UTC
  source_level: string;
  profile_id?: string;
  settings: PolicySettings;
}

export interface PolicyEstimateScenario {
  scenario_id: string;
  name: string;
  duration_minutes: number;
  players_count: number;
  total_price_minor: number;
  due_now_minor: number;
  remaining_balance_minor: number;
  per_player_share_minor?: number;
  per_player_due_now_minor?: number;
  cancellation_deadline_hours: number;
  penalty_on_late_cancel_minor: number;
  customer_display: {
    price_formatted: string;
    due_now_formatted: string;
    balance_formatted: string;
    free_cancellation_text: string;
    settlement_options_text: string;
  };
}

export interface ResourcePolicyComparisonItem {
  resource_id: string;
  name: string;
  type: string;
  room_name: string;
  zone_name: string | null;
  effective_hourly_rate_minor: number;
  rate_source: string;
  effective_deposit_percentage: number;
  policy_source: string;
  diff_from_venue_default_minor: number;
}

export interface PolicyPreviewResult {
  venue_id: string;
  preview_resource_id?: string;
  applied_policy_level: string;
  effective_settings: PolicySettings;
  base_hourly_rate_minor: number;
  currency: string;
  scenarios: PolicyEstimateScenario[];
  resource_comparisons: ResourcePolicyComparisonItem[];
  customer_disclosures: {
    free_cancellation_disclosure: string;
    deposit_disclosure: string;
    statutory_notice: string;
  };
  validation_warnings: string[];
}
