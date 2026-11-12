export type SecurityViolationType =
  | 'BOLA_UNAUTHORIZED_OBJECT_ACCESS'
  | 'CROSS_TENANT_TAMPERING'
  | 'RATE_LIMIT_EXCEEDED'
  | 'TAMPERED_PRICE_OR_SETTLEMENT'
  | 'MALICIOUS_PAYLOAD_DETECTED'
  | 'INVALID_MFA_ATTEMPT';

export interface LogSecurityViolationInput {
  violationType: SecurityViolationType;
  actorId?: string | null;
  tenantId?: string | null;
  venueId?: string | null;
  targetType?: string;
  targetId?: string;
  endpoint?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface SecurityMetricsSummary {
  total_violations: number;
  violations_by_type: Record<string, number>;
  recent_violations: Array<{
    id: string;
    violation_type: string;
    actor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    occurred_at: string;
    metadata: Record<string, unknown>;
  }>;
  high_risk_flag: boolean;
}

export interface SystemHealthSummary {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  database: {
    connected: boolean;
    latency_ms: number;
    active_connections: number;
    idle_connections: number;
    waiting_requests: number;
  };
  outbox_queue: {
    pending_events: number;
    oldest_pending_timestamp?: string | null;
    healthy: boolean;
  };
  security: {
    recent_violations_count: number;
    rate_limited_count: number;
  };
  uptime_seconds: number;
}
