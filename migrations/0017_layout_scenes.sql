-- ENG-203: Layout scenes, drafts, and layers data model.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS layout_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  revision int NOT NULL DEFAULT 1,
  schema_version int NOT NULL DEFAULT 1,
  canvas jsonb NOT NULL DEFAULT '{"width": 1600, "height": 1000, "grid": 20}'::jsonb,
  rooms jsonb NOT NULL DEFAULT '[]'::jsonb,
  layers jsonb NOT NULL DEFAULT '[
    {"id": "background", "name": "Background", "visible": true, "locked": false},
    {"id": "walls", "name": "Walls & Doors", "visible": true, "locked": false},
    {"id": "furniture", "name": "Furniture & Desks", "visible": true, "locked": false},
    {"id": "equipment", "name": "Equipment", "visible": true, "locked": false},
    {"id": "labels", "name": "Labels & Text", "visible": true, "locked": false}
  ]'::jsonb,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT layout_drafts_venue_id_uniq UNIQUE (venue_id)
);

CREATE INDEX IF NOT EXISTS layout_drafts_venue_id_idx ON layout_drafts (venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON layout_drafts TO gamerbooker_app;
