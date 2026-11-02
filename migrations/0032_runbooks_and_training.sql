-- migrations/0032_runbooks_and_training.sql
-- Schema extensions for ENG-506: Incident runbooks, partner training, pilot metrics

CREATE TABLE IF NOT EXISTS staff_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  certified_by uuid REFERENCES users(id),
  certified_at timestamptz NOT NULL DEFAULT now(),
  score integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_certifications_unique UNIQUE (user_id, venue_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_certifications_venue
  ON staff_certifications (venue_id, module_id);

CREATE INDEX IF NOT EXISTS idx_staff_certifications_user
  ON staff_certifications (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_certifications TO gamerbooker_app;
