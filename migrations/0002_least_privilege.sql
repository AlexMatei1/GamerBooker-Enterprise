-- ENG-002: least privilege, audit schema alignment, tenant integrity.
--
-- Three findings from the Slice A review are closed here:
--   1. The application connected as the table owner, so it could DISABLE the
--      append-only trigger and rewrite audit history. It now connects as a
--      separate role that holds SELECT and INSERT on audit_events only.
--   2. audit_events used column names that diverge from
--      docs/05-venue-dashboard/04-roles-onboarding-and-audit.md:36, and was
--      missing the columns the document requires. Aligned before Slice B
--      writes them.
--   3. venue_memberships.tenant_id was not tied to the venue's own tenant, so a
--      forged row could present a venue of tenant B under tenant A.
--
-- Every statement is guarded, so the file is safe to re-run. That matters
-- because the test harness applies migrations per suite and jest runs suites in
-- parallel: the role is cluster-wide and two workers can reach it at once.
--
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. audit_events: align with the documented schema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'actor_user_id'
  ) THEN
    ALTER TABLE audit_events RENAME COLUMN actor_user_id TO actor_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'subject_type'
  ) THEN
    ALTER TABLE audit_events RENAME COLUMN subject_type TO target_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'subject_id'
  ) THEN
    ALTER TABLE audit_events RENAME COLUMN subject_id TO target_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'audit_events_actor_user_id_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'audit_events_actor_id_idx') THEN
    ALTER INDEX audit_events_actor_user_id_idx RENAME TO audit_events_actor_id_idx;
  END IF;
END
$$;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS before_hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS after_hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS diff_redacted jsonb;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS approval_id uuid;

-- A row without a request id cannot be correlated with the request that caused
-- it, which is the whole point of the column. Fails loudly if a row predates
-- this rule: the table is append-only, so a silent backfill is not an option.
ALTER TABLE audit_events ALTER COLUMN request_id SET NOT NULL;

-- 2. venue_memberships.tenant_id must be the tenant that owns the venue.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_id_tenant_uniq') THEN
    ALTER TABLE venues ADD CONSTRAINT venues_id_tenant_uniq UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_memberships_venue_tenant_fk'
  ) THEN
    ALTER TABLE venue_memberships
      ADD CONSTRAINT venue_memberships_venue_tenant_fk
      FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id);
  END IF;
END
$$;

-- 3. Least privilege: the application role cannot touch audit history.
--
-- CREATE ROLE is cluster-wide, so a concurrent worker may have created it
-- between the check and the statement. duplicate_object is the expected race
-- and is not an error.
DO $$
BEGIN
  BEGIN
    CREATE ROLE gamerbooker_app LOGIN;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

GRANT USAGE ON SCHEMA public TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, verification_tokens, tenants, venues, venue_memberships
  TO gamerbooker_app;

-- Append only, for this role too. Not the owner, so no ALTER TABLE, no DISABLE
-- TRIGGER, no TRUNCATE.
GRANT SELECT, INSERT ON audit_events TO gamerbooker_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM gamerbooker_app;
