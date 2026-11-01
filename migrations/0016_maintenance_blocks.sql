-- Migration 0016: Maintenance Blocks and Claim Type Expansion
-- Part of ENG-206: Live floor and calendar, check-in scanner, maintenance blocks

-- 1. Expand claim_type constraint to allow 'MAINTENANCE'
ALTER TABLE resource_claims DROP CONSTRAINT IF EXISTS resource_claims_claim_type_check;
ALTER TABLE resource_claims ADD CONSTRAINT resource_claims_claim_type_check
  CHECK (claim_type IN ('HOLD', 'BOOKING', 'MAINTENANCE'));

-- 2. Create maintenance_blocks table
CREATE TABLE IF NOT EXISTS maintenance_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  claim_id uuid REFERENCES resource_claims(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_blocks_time_check CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS maintenance_blocks_venue_id_idx ON maintenance_blocks (venue_id);
CREATE INDEX IF NOT EXISTS maintenance_blocks_resource_id_idx ON maintenance_blocks (resource_id);
CREATE INDEX IF NOT EXISTS maintenance_blocks_status_idx ON maintenance_blocks (status);
CREATE INDEX IF NOT EXISTS maintenance_blocks_time_idx ON maintenance_blocks (starts_at, ends_at);

-- 3. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_blocks TO gamerbooker_app;
