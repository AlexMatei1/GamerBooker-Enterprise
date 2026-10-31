-- ENG-102: Policy profiles, validation, and immutable snapshots.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS policy_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  settings jsonb NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_profiles_venue_id_idx ON policy_profiles (venue_id);

CREATE UNIQUE INDEX IF NOT EXISTS policy_profiles_venue_default_uniq
  ON policy_profiles (venue_id)
  WHERE is_default;

-- Add foreign key constraint from zones to policy_profiles if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zones_policy_profile_fk'
  ) THEN
    ALTER TABLE zones
      ADD CONSTRAINT zones_policy_profile_fk
      FOREIGN KEY (policy_profile_id) REFERENCES policy_profiles (id) ON DELETE SET NULL;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON policy_profiles TO gamerbooker_app;
