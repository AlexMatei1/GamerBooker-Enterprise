-- ENG-107: Refunds and lifecycle compensating workflows.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  status text NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'SUBMITTED', 'SUCCEEDED', 'FAILED_RETRYABLE', 'MANUAL_REVIEW')),
  reason text NOT NULL,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refunds_venue_id_idx ON refunds (venue_id);
CREATE INDEX IF NOT EXISTS refunds_booking_id_idx ON refunds (booking_id);
CREATE INDEX IF NOT EXISTS refunds_customer_id_idx ON refunds (customer_id);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status);

-- 2. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON refunds TO gamerbooker_app;
