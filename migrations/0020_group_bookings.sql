-- ENG-301: Group bookings and split allocation schema.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS group_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE RESTRICT,
  hold_id uuid REFERENCES holds(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('ORGANIZER_PAYS_ALL', 'SPLIT_BY_PARTICIPANT')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_PAYMENTS', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  due_now_minor bigint NOT NULL CHECK (due_now_minor > 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  currency text NOT NULL DEFAULT 'RON',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_bookings_venue_id_idx ON group_bookings (venue_id);
CREATE INDEX IF NOT EXISTS group_bookings_organizer_id_idx ON group_bookings (organizer_id);
CREATE INDEX IF NOT EXISTS group_bookings_quote_id_idx ON group_bookings (quote_id);
CREATE INDEX IF NOT EXISTS group_bookings_status_idx ON group_bookings (status);

CREATE TABLE IF NOT EXISTS group_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_booking_id uuid NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_email text,
  invitation_token text UNIQUE,
  is_organizer boolean NOT NULL DEFAULT false,
  assigned_resource_id uuid REFERENCES resources(id) ON DELETE SET NULL,
  share_total_minor bigint NOT NULL CHECK (share_total_minor >= 0),
  share_due_now_minor bigint NOT NULL CHECK (share_due_now_minor >= 0),
  share_balance_minor bigint NOT NULL DEFAULT 0 CHECK (share_balance_minor >= 0),
  share_paid_minor bigint NOT NULL DEFAULT 0 CHECK (share_paid_minor >= 0),
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACCEPTED', 'PAYING', 'PAID', 'DECLINED', 'EXPIRED')),
  token_expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_participants_group_booking_id_idx ON group_participants (group_booking_id);
CREATE INDEX IF NOT EXISTS group_participants_user_id_idx ON group_participants (user_id);
CREATE INDEX IF NOT EXISTS group_participants_invitation_token_idx ON group_participants (invitation_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON group_bookings, group_participants TO gamerbooker_app;
