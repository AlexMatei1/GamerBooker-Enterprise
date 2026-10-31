-- ENG-004: Exclusion constraints for resource_claims to prevent overlapping holds on the same resource.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create the table for resource claims (holds/bookings)
CREATE TABLE IF NOT EXISTS resource_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL, -- user or staff identifier
  claim_type text NOT NULL CHECK (claim_type IN ('HOLD', 'BOOKING')),
  state text NOT NULL CHECK (state IN ('ACTIVE_HOLD', 'CONFIRMED', 'CANCELLED')),
  slot tstzrange NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Exclusion constraint to prevent overlapping ACTIVE_HOLD or CONFIRMED claims on the same resource.
-- The constraint is filtered to rows where state is either ACTIVE_HOLD or CONFIRMED.
CREATE EXTENSION IF NOT EXISTS btree_gist; -- needed for range exclusion

ALTER TABLE resource_claims
  ADD CONSTRAINT resource_claims_no_overlap EXCLUDE USING GIST (
    resource_id WITH =,
    slot WITH &&
  ) WHERE (state IN ('ACTIVE_HOLD', 'CONFIRMED'));

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS resource_claims_resource_id_idx ON resource_claims (resource_id);
CREATE INDEX IF NOT EXISTS resource_claims_tenant_id_idx ON resource_claims (tenant_id);
CREATE INDEX IF NOT EXISTS resource_claims_state_idx ON resource_claims (state);

-- 4. Grant privileges to the app role
GRANT SELECT, INSERT, UPDATE, DELETE ON resource_claims TO gamerbooker_app;
