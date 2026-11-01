-- ENG-204: Resource adjacencies for smart seat allocation and proximity graph.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS resource_adjacencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  resource_a_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  resource_b_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  distance_metric int NOT NULL DEFAULT 1 CHECK (distance_metric >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_adjacencies_no_self CHECK (resource_a_id <> resource_b_id),
  CONSTRAINT resource_adjacencies_ordered_pair CHECK (resource_a_id < resource_b_id),
  CONSTRAINT resource_adjacencies_pair_uniq UNIQUE (venue_id, resource_a_id, resource_b_id)
);

CREATE INDEX IF NOT EXISTS resource_adjacencies_venue_id_idx ON resource_adjacencies (venue_id);
CREATE INDEX IF NOT EXISTS resource_adjacencies_resource_a_idx ON resource_adjacencies (resource_a_id);
CREATE INDEX IF NOT EXISTS resource_adjacencies_resource_b_idx ON resource_adjacencies (resource_b_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON resource_adjacencies TO gamerbooker_app;
