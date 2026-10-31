-- ENG-104: Atomic holds, component closure claims, and outbox events.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create holds table
CREATE TABLE IF NOT EXISTS holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE CASCADE,
  idempotency_key text UNIQUE,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'CONSUMED', 'RELEASED')),
  resource_ids uuid[] NOT NULL,
  atomic_resource_ids uuid[] NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holds_venue_id_idx ON holds (venue_id);
CREATE INDEX IF NOT EXISTS holds_customer_id_idx ON holds (customer_id);
CREATE INDEX IF NOT EXISTS holds_status_idx ON holds (status);
CREATE INDEX IF NOT EXISTS holds_expires_at_idx ON holds (expires_at) WHERE status = 'ACTIVE';

-- 2. Update resource_claims table
ALTER TABLE resource_claims DROP CONSTRAINT IF EXISTS resource_claims_state_check;
ALTER TABLE resource_claims ADD CONSTRAINT resource_claims_state_check
  CHECK (state IN ('ACTIVE_HOLD', 'CONFIRMED', 'CANCELLED', 'RELEASED'));

ALTER TABLE resource_claims ADD COLUMN IF NOT EXISTS hold_id uuid REFERENCES holds(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS resource_claims_hold_id_idx ON resource_claims (hold_id);

-- 3. Create outbox_events table for transactional event publishing
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_events_published_idx ON outbox_events (published) WHERE NOT published;

-- 4. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON holds, outbox_events TO gamerbooker_app;
