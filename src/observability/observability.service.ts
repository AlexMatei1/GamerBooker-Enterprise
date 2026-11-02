import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import {
  LogSecurityViolationInput,
  SecurityMetricsSummary,
  SystemHealthSummary,
} from './observability.types';

@Injectable()
export class ObservabilityService {
  private readonly processStartTime = Date.now();

  async logSecurityViolation(input: LogSecurityViolationInput): Promise<{ id: string }> {
    const pool = getPool();
    const meta = {
      violation_type: input.violationType,
      endpoint: input.endpoint,
      ip_address: input.ipAddress,
      ...(input.metadata || {}),
    };

    const res = await pool.query<{ id: string }>(
      `INSERT INTO audit_events (
         tenant_id, venue_id, actor_id, action, target_type, target_id, metadata, request_id
       )
       VALUES ($1, $2, $3, 'SECURITY_VIOLATION', $4, $5, $6, $7)
       RETURNING id`,
      [
        input.tenantId || null,
        input.venueId || null,
        input.actorId || null,
        input.targetType || 'API_ENDPOINT',
        input.targetId || null,
        JSON.stringify(meta),
        input.requestId || randomUUID(),
      ],
    );

    return { id: res.rows[0].id };
  }

  async getSecurityMetrics(tenantId?: string): Promise<SecurityMetricsSummary> {
    const pool = getPool();
    let filterSql = "WHERE action = 'SECURITY_VIOLATION'";
    const params: any[] = [];

    if (tenantId) {
      filterSql += ' AND tenant_id = $1';
      params.push(tenantId);
    }

    // 1. Violations by type
    const typesRes = await pool.query<{ violation_type: string; count: string }>(
      `SELECT (metadata->>'violation_type') as violation_type, count(*)::text as count
         FROM audit_events
        ${filterSql}
        GROUP BY (metadata->>'violation_type')`,
      params,
    );

    const violationsByType: Record<string, number> = {};
    let totalViolations = 0;
    for (const r of typesRes.rows) {
      const cnt = Number(r.count);
      violationsByType[r.violation_type || 'UNKNOWN'] = cnt;
      totalViolations += cnt;
    }

    // 2. Recent violations
    const recentRes = await pool.query<{
      id: string;
      actor_id?: string | null;
      target_type?: string | null;
      target_id?: string | null;
      metadata: any;
      occurred_at: string;
    }>(
      `SELECT id, actor_id, target_type, target_id, metadata, occurred_at
         FROM audit_events
        ${filterSql}
        ORDER BY occurred_at DESC
        LIMIT 20`,
      params,
    );

    const recentViolations = recentRes.rows.map((r) => ({
      id: r.id,
      violation_type: r.metadata?.violation_type || 'SECURITY_VIOLATION',
      actor_id: r.actor_id,
      target_type: r.target_type,
      target_id: r.target_id,
      occurred_at: r.occurred_at,
      metadata: r.metadata || {},
    }));

    return {
      total_violations: totalViolations,
      violations_by_type: violationsByType,
      recent_violations: recentViolations,
      high_risk_flag: totalViolations > 10,
    };
  }

  async getSystemHealth(): Promise<SystemHealthSummary> {
    const pool = getPool();
    const startPing = Date.now();
    let dbConnected = false;
    let latencyMs = 0;

    try {
      await pool.query('SELECT 1');
      dbConnected = true;
      latencyMs = Date.now() - startPing;
    } catch {
      dbConnected = false;
      latencyMs = -1;
    }

    // Connection pool stats
    const totalCount = pool.totalCount || 0;
    const idleCount = pool.idleCount || 0;
    const waitingCount = pool.waitingCount || 0;
    const activeCount = Math.max(0, totalCount - idleCount);

    // Outbox backlog
    let pendingEvents = 0;
    let oldestTimestamp: string | null = null;
    try {
      const outboxRes = await pool.query<{ count: string; oldest: string | null }>(
        `SELECT count(*)::text as count, min(created_at)::text as oldest
           FROM outbox_events
          WHERE published = false`,
      );
      if (outboxRes.rows.length > 0) {
        pendingEvents = Number(outboxRes.rows[0].count);
        oldestTimestamp = outboxRes.rows[0].oldest;
      }
    } catch {
      pendingEvents = 0;
    }

    // Recent security violations
    let recentViolationsCount = 0;
    try {
      const secRes = await pool.query<{ count: string }>(
        `SELECT count(*)::text as count
           FROM audit_events
          WHERE action = 'SECURITY_VIOLATION' AND occurred_at >= now() - interval '24 hours'`,
      );
      recentViolationsCount = Number(secRes.rows[0]?.count || 0);
    } catch {
      recentViolationsCount = 0;
    }

    let status: SystemHealthSummary['status'] = 'HEALTHY';
    if (!dbConnected || latencyMs > 2000) {
      status = 'UNHEALTHY';
    } else if (latencyMs > 500 || pendingEvents > 1000 || waitingCount > 20) {
      status = 'DEGRADED';
    }

    return {
      status,
      database: {
        connected: dbConnected,
        latency_ms: latencyMs,
        active_connections: activeCount,
        idle_connections: idleCount,
        waiting_requests: waitingCount,
      },
      outbox_queue: {
        pending_events: pendingEvents,
        oldest_pending_timestamp: oldestTimestamp,
        healthy: pendingEvents < 500,
      },
      security: {
        recent_violations_count: recentViolationsCount,
        rate_limited_count: 0,
      },
      uptime_seconds: Math.floor((Date.now() - this.processStartTime) / 1000),
    };
  }
}
