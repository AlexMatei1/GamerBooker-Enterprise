-- Migration 0029: Notifications, Preferences, Delivery Idempotency & Receipts

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'IN_APP',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH', 'SMS')),
  event_type text NOT NULL,
  template_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index to guarantee delivery idempotency per event, recipient, and channel
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_event_recipient_channel 
  ON notification_deliveries (event_id, recipient_id, channel);

-- Least privilege permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO gamerbooker_app;
