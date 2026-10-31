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
