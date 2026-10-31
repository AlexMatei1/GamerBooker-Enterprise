-- ENG-103: Pricing rules and server-signed price quotes.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('VENUE_DEFAULT', 'ZONE', 'RESOURCE')),
  target_id uuid,
  hourly_rate_minor bigint NOT NULL CHECK (hourly_rate_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_rules_venue_id_idx ON price_rules (venue_id);

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_venue_default_uniq
  ON price_rules (venue_id)
  WHERE target_type = 'VENUE_DEFAULT';

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_target_uniq
  ON price_rules (venue_id, target_type, target_id)
  WHERE target_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS price_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  items_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  due_now_minor bigint NOT NULL CHECK (due_now_minor > 0),
  balance_minor bigint NOT NULL CHECK (balance_minor >= 0),
  currency text NOT NULL DEFAULT 'RON',
  signature text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_quotes_venue_id_idx ON price_quotes (venue_id);
CREATE INDEX IF NOT EXISTS price_quotes_customer_id_idx ON price_quotes (customer_id);
CREATE INDEX IF NOT EXISTS price_quotes_expires_at_idx ON price_quotes (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON price_rules, price_quotes TO gamerbooker_app;
