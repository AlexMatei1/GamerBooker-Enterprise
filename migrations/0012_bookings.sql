-- ENG-105: Bookings table, confirmation guard, and state machine.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hold_id uuid REFERENCES holds(id) ON DELETE SET NULL,
  quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'COMPLETED')),
  type text NOT NULL DEFAULT 'SINGLE' CHECK (type IN ('SINGLE', 'GROUP')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Bucharest',
  resource_ids uuid[] NOT NULL,
  atomic_resource_ids uuid[] NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  due_now_minor bigint NOT NULL CHECK (due_now_minor > 0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  currency text NOT NULL DEFAULT 'RON',
  price_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  idempotency_key text UNIQUE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for bookings table
CREATE INDEX IF NOT EXISTS bookings_venue_id_idx ON bookings (venue_id);
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_starts_at_idx ON bookings (starts_at);
CREATE INDEX IF NOT EXISTS bookings_public_code_idx ON bookings (public_code);

-- 3. Link resource_claims to bookings
ALTER TABLE resource_claims ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS resource_claims_booking_id_idx ON resource_claims (booking_id);

-- 4. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO gamerbooker_app;
