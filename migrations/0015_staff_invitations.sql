-- Migration 0015: Staff Invitations and Onboarding Support
-- Part of ENG-201: Venue setup wizard, staff invitation and permissions

CREATE TABLE IF NOT EXISTS staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'VENUE_MANAGER', 'RECEPTION', 'BAR_STAFF')),
  token_hash bytea NOT NULL UNIQUE,
  invited_by_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_invitations_venue_idx ON staff_invitations(venue_id);
CREATE INDEX IF NOT EXISTS staff_invitations_email_idx ON staff_invitations(email);
CREATE INDEX IF NOT EXISTS staff_invitations_status_idx ON staff_invitations(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_invitations TO gamerbooker_app;
