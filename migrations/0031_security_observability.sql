-- Migration 0031: Security Auditing & Observability Indexes

CREATE INDEX IF NOT EXISTS idx_audit_events_action_created ON audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_action ON audit_events (tenant_id, action, created_at DESC);

-- Ensure gamerbooker_app has appropriate privileges on audit_events
GRANT SELECT, INSERT ON audit_events TO gamerbooker_app;
