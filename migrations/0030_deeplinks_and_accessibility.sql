-- Migration 0030: Deferred Deep Links & On-site QR Conversion Analytics

CREATE TABLE IF NOT EXISTS deferred_deeplinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deferred_deeplinks_token ON deferred_deeplinks (token);
CREATE INDEX IF NOT EXISTS idx_deferred_deeplinks_expires ON deferred_deeplinks (expires_at);

CREATE TABLE IF NOT EXISTS qr_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  milestone text NOT NULL CHECK (milestone IN ('SCANNED', 'STORE_REDIRECTED', 'APP_OPENED', 'DEFERRED_LINK_RESOLVED', 'BOOKING_STARTED', 'BOOKING_COMPLETED')),
  platform text NOT NULL CHECK (platform IN ('IOS', 'ANDROID', 'DESKTOP_WEB', 'OTHER')),
  source_tag text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_funnel_venue_milestone ON qr_funnel_events (venue_id, milestone, created_at DESC);

-- Least privilege grants
GRANT SELECT, INSERT, UPDATE, DELETE ON deferred_deeplinks TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON qr_funnel_events TO gamerbooker_app;
