-- ENG-106: Checkins and offline receipts for solo checkout and reception operations.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create checkins table
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qr_token_ref text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkins_booking_uniq UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS checkins_venue_id_idx ON checkins (venue_id);
CREATE INDEX IF NOT EXISTS checkins_booking_id_idx ON checkins (booking_id);
CREATE INDEX IF NOT EXISTS checkins_staff_id_idx ON checkins (staff_id);

-- 2. Create offline_receipts table for reception payments
CREATE TABLE IF NOT EXISTS offline_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'POS_TERMINAL', 'RECEPTION_CARD')),
  reference text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_receipts_venue_ref_uniq UNIQUE (venue_id, reference)
);

CREATE INDEX IF NOT EXISTS offline_receipts_venue_id_idx ON offline_receipts (venue_id);
CREATE INDEX IF NOT EXISTS offline_receipts_booking_id_idx ON offline_receipts (booking_id);

-- 3. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON checkins, offline_receipts TO gamerbooker_app;
