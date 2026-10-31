-- ENG-005: PSP integration contract, sandbox, and webhook replay harness.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid,
  order_id uuid,
  provider text NOT NULL,
  provider_ref text NOT NULL,
  idempotency_key text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  status text NOT NULL CHECK (status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_provider_ref_uniq UNIQUE (provider_ref),
  CONSTRAINT payment_intents_idempotency_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_intents_venue_id_idx ON payment_intents (venue_id);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON payment_intents (status);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  provider_ref text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('PROCESSED', 'IGNORED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_event_uniq UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_ref_idx ON payment_webhook_events (provider_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_intents, payment_webhook_events TO gamerbooker_app;
