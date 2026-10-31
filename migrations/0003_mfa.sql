-- ENG-002 Slice B part 2: TOTP second factors (ENG002-T04).
--
-- D2: MFA is mandatory for OWNER, VENUE_MANAGER and PLATFORM_ADMIN.
-- D3: TOTP, not SMS.
-- D5: the shared secret is encrypted at rest with pgcrypto and a key that comes
--     from the environment, never from the database. The key is passed as a
--     bind parameter, so it never becomes part of the SQL text.
--
-- Lockout state lives on the factor, not on the session: an attacker who drops
-- the pending session and logs in again must meet the same lock (D11).
--
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS user_mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'totp' CHECK (type = 'totp'),
  -- pgp_sym_encrypt(secret, MFA_SECRET_KEY). Never the plaintext.
  secret_encrypted bytea NOT NULL,
  confirmed_at timestamptz,
  -- SHA-256 hex of each recovery code, in the canonical dashed-free form.
  recovery_codes_hash text[] NOT NULL DEFAULT '{}',
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  -- TOTP time step that last verified, so the same code cannot be replayed
  -- inside its 30 second window (D12).
  last_used_time_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One factor per user per type. Also the ON CONFLICT target for enrolment.
CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_factors_user_type_uniq
  ON user_mfa_factors (user_id, type);

-- Same least-privilege role as the rest of the application schema. The owner
-- DSN stays with migrations only.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa_factors TO gamerbooker_app;
