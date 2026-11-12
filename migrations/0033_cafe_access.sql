-- Owner-only migration. Runtime credentials must be gamerbooker_app, never owner.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS platform_grants (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  operator_reference text NOT NULL,
  revoked_at timestamptz
);
REVOKE ALL ON platform_grants FROM PUBLIC, gamerbooker_app;
GRANT SELECT ON platform_grants TO gamerbooker_app;

CREATE TABLE IF NOT EXISTS cafe_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 160),
  venue_name text NOT NULL CHECK (length(venue_name) BETWEEN 2 AND 120),
  timezone text NOT NULL,
  city text NOT NULL CHECK (length(city) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decision_reason text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  tenant_id uuid REFERENCES tenants(id),
  venue_id uuid REFERENCES venues(id),
  access_suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='PENDING' AND decided_at IS NULL AND decided_by IS NULL AND tenant_id IS NULL AND venue_id IS NULL)
    OR (status='REJECTED' AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND tenant_id IS NULL AND venue_id IS NULL)
    OR (status='APPROVED' AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND tenant_id IS NOT NULL AND venue_id IS NOT NULL)),
  FOREIGN KEY (venue_id,tenant_id) REFERENCES venues(id,tenant_id)
);
GRANT SELECT, INSERT, UPDATE ON cafe_applications TO gamerbooker_app;
REVOKE DELETE, TRUNCATE ON cafe_applications FROM PUBLIC, gamerbooker_app;

CREATE OR REPLACE FUNCTION cafe_decision_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'PENDING' AND
    (NEW.status,NEW.applicant_user_id,NEW.legal_name,NEW.venue_name,NEW.timezone,NEW.city,
     NEW.decided_by,NEW.decided_at,NEW.decision_reason,NEW.tenant_id,NEW.venue_id)
    IS DISTINCT FROM
    (OLD.status,OLD.applicant_user_id,OLD.legal_name,OLD.venue_name,OLD.timezone,OLD.city,
     OLD.decided_by,OLD.decided_at,OLD.decision_reason,OLD.tenant_id,OLD.venue_id) THEN
    RAISE EXCEPTION 'Application decisions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cafe_decision_immutable ON cafe_applications;
CREATE TRIGGER cafe_decision_immutable BEFORE UPDATE ON cafe_applications
FOR EACH ROW EXECUTE FUNCTION cafe_decision_immutable();

-- Do not rewrite or promote legacy PLATFORM_ADMIN memberships. Ignore them in
-- authorization and reject new ones even from old invitation/code paths.
CREATE OR REPLACE FUNCTION venue_role_only() RETURNS trigger AS $$
BEGIN
  IF NEW.role NOT IN ('OWNER','VENUE_MANAGER','RECEPTION','BAR_STAFF') THEN
    RAISE EXCEPTION 'Only venue roles are allowed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS venue_role_only ON venue_memberships;
CREATE TRIGGER venue_role_only BEFORE INSERT OR UPDATE ON venue_memberships
FOR EACH ROW EXECUTE FUNCTION venue_role_only();
