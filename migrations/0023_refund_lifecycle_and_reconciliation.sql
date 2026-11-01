-- ENG-305: Refund lifecycle, daily reconciliation reports, and alerting.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Extend refunds table with lifecycle and audit columns
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_venue_idempotency_uniq
  ON refunds (venue_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS refunds_status_venue_idx
  ON refunds (venue_id, status);

CREATE INDEX IF NOT EXISTS refunds_created_venue_idx
  ON refunds (venue_id, created_at DESC);

-- 2. Daily reconciliation reports table
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  online_captures_minor bigint NOT NULL DEFAULT 0,
  online_refunds_minor bigint NOT NULL DEFAULT 0,
  net_online_minor bigint NOT NULL DEFAULT 0,
  reception_cash_minor bigint NOT NULL DEFAULT 0,
  reception_card_minor bigint NOT NULL DEFAULT 0,
  voided_offline_minor bigint NOT NULL DEFAULT 0,
  total_collected_minor bigint NOT NULL DEFAULT 0,
  closing_balance_minor bigint NOT NULL DEFAULT 0,
  discrepancy_count integer NOT NULL DEFAULT 0,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'GENERATED'
    CHECK (status IN ('GENERATED', 'RECONCILED', 'DISCREPANCY_FLAGGED')),
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_reports_venue_date_uniq UNIQUE (venue_id, report_date)
);

CREATE INDEX IF NOT EXISTS reconciliation_reports_venue_date_idx
  ON reconciliation_reports (venue_id, report_date DESC);

-- 3. Reconciliation alerts table
CREATE TABLE IF NOT EXISTS reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN ('STUCK_REFUND', 'DISCREPANCY_DETECTED', 'HIGH_VOID_VOLUME', 'ORPHAN_INTENT', 'OVER_REFUND_ATTEMPT')),
  severity text NOT NULL
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledgement_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reconciliation_alerts_venue_idx
  ON reconciliation_alerts (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reconciliation_alerts_active_idx
  ON reconciliation_alerts (venue_id)
  WHERE acknowledged_at IS NULL;

-- 4. Grant least privilege permissions to gamerbooker_app
GRANT SELECT, INSERT, UPDATE, DELETE ON refunds TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_reports TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_alerts TO gamerbooker_app;
