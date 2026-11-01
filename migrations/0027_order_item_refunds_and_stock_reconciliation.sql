-- ENG-404: Order item partial refunds, Law 42/2024 age refusal, and physical stock reconciliation.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Extend order_items with status and refund tracking
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REFUNDED_UNAVAILABLE', 'REFUSED_AGE_RESTRICTION')),
  ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES refunds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refunded_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS order_items_status_idx
  ON order_items (order_id, status);

-- 2. Create stock_reconciliation_audits table
CREATE TABLE IF NOT EXISTS stock_reconciliation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  performed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  items_counted integer NOT NULL DEFAULT 0,
  discrepancy_items_count integer NOT NULL DEFAULT 0,
  total_discrepancy_units integer NOT NULL DEFAULT 0,
  total_shrinkage_value_minor bigint NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_reconciliation_venue_idx
  ON stock_reconciliation_audits (venue_id, created_at DESC);

-- 3. Create stock_reconciliation_items table
CREATE TABLE IF NOT EXISTS stock_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES stock_reconciliation_audits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_stock integer NOT NULL,
  counted_stock integer NOT NULL,
  discrepancy_quantity integer NOT NULL,
  discrepancy_value_minor bigint NOT NULL DEFAULT 0,
  adjustment_type text NOT NULL DEFAULT 'NONE'
    CHECK (adjustment_type IN ('NONE', 'SHRINKAGE', 'SURPLUS')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_reconciliation_items_audit_idx
  ON stock_reconciliation_items (audit_id);

CREATE INDEX IF NOT EXISTS stock_reconciliation_items_product_idx
  ON stock_reconciliation_items (product_id);

-- 4. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_reconciliation_audits TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_reconciliation_items TO gamerbooker_app;
GRANT SELECT, UPDATE ON order_items TO gamerbooker_app;
