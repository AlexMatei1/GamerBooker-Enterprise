-- ENG-205: Layout published revisions, active revision pointer, and rollback history.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS layout_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  revision_number int NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  canvas jsonb NOT NULL,
  rooms jsonb NOT NULL,
  layers jsonb NOT NULL,
  nodes jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  change_summary text,
  CONSTRAINT layout_revisions_venue_rev_uniq UNIQUE (venue_id, revision_number)
);

CREATE INDEX IF NOT EXISTS layout_revisions_venue_id_idx ON layout_revisions (venue_id);
CREATE INDEX IF NOT EXISTS layout_revisions_published_at_idx ON layout_revisions (published_at DESC);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS active_layout_revision_id uuid REFERENCES layout_revisions(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON layout_revisions TO gamerbooker_app;
