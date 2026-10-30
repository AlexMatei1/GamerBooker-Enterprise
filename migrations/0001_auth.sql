-- ENG-002 Slice A: authentication core.
-- Tables: users, sessions, verification_tokens, tenants, venues,
-- venue_memberships, audit_events.
-- Idempotent guards: IF NOT EXISTS plus DROP TRIGGER before CREATE TRIGGER.
-- No BEGIN/COMMIT here on purpose: db/migrate.js already wraps each file in
-- one transaction, and a nested COMMIT would end that transaction early.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_verified_at timestamptz,
  phone text,
  phone_verified_at timestamptz,
  password_hash text,
  identity_status text NOT NULL DEFAULT 'unverified'
    CHECK (identity_status IN ('unverified', 'verified', 'suspended')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Email is globally unique and case-insensitive while the row is live.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_active_uniq
  ON users (lower(email))
  WHERE deleted_at IS NULL;

-- Phone is optional; uniqueness applies only to non-null live values.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_active_uniq
  ON users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('mobile', 'dashboard')),
  mfa_state text NOT NULL DEFAULT 'active'
    CHECK (mfa_state IN ('pending', 'active')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_hash text,
  ua_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'email_verify',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_tokens_user_id_idx
  ON verification_tokens (user_id);

-- Minimal dependencies. ENG-003 owns the full tenants/venues columns.
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  timezone text NOT NULL DEFAULT 'Europe/Bucharest',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venues_tenant_id_idx ON venues (tenant_id);

CREATE TABLE IF NOT EXISTS venue_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role text NOT NULL
    CHECK (role IN ('PLATFORM_ADMIN', 'OWNER', 'VENUE_MANAGER', 'RECEPTION', 'BAR_STAFF')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_memberships_user_venue_active_uniq
  ON venue_memberships (user_id, venue_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS venue_memberships_venue_id_idx
  ON venue_memberships (venue_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  tenant_id uuid,
  venue_id uuid,
  action text NOT NULL,
  subject_type text,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx
  ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_user_id_idx
  ON audit_events (actor_user_id);

-- Append-only, enforced in the database.
-- docs/02-architecture/01-system-architecture.md:59 - outbox published after
-- commit; audit trail is immutable. docs/09-security/01-security-and-privacy.md:19 -
-- audit append-only for refund, policy, layout publish, staff role, offline receipt.
-- docs/05-venue-dashboard/04-roles-onboarding-and-audit.md:36 - Append-only.
-- BR-024 (docs/01-product/03-business-rules.md:28): the owner cannot disable audit,
-- so a plain convention is not enough.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events;
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION audit_events_append_only();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_events_append_only();
