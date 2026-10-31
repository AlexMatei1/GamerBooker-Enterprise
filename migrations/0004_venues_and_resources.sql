-- ENG-003: Multi-tenant venue schema, rooms, zones, resources, and memberships.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Extend tenants and venues with onboarding and publication metadata
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_profile jsonb NOT NULL DEFAULT '{}';

ALTER TABLE venues ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'GamerBooker Venue';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address jsonb NOT NULL DEFAULT '{}';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'DRAFT'
  CHECK (publication_state IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS venues_publication_state_idx ON venues (publication_state);

-- 2. Physical rooms and zones
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  geometry_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_venue_name_uniq UNIQUE (venue_id, name)
);

CREATE INDEX IF NOT EXISTS rooms_venue_id_idx ON rooms (venue_id);

CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  policy_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_room_name_uniq UNIQUE (room_id, name)
);

CREATE INDEX IF NOT EXISTS zones_venue_id_idx ON zones (venue_id);
CREATE INDEX IF NOT EXISTS zones_room_id_idx ON zones (room_id);

-- 3. Resources (PC, CONSOLE_SETUP, PRIVATE_ROOM)
CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('PC', 'CONSOLE_SETUP', 'PRIVATE_ROOM')),
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}',
  bookable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'MAINTENANCE', 'TEMP_BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resources_venue_name_uniq UNIQUE (venue_id, name)
);

CREATE INDEX IF NOT EXISTS resources_venue_id_idx ON resources (venue_id);
CREATE INDEX IF NOT EXISTS resources_room_id_idx ON resources (room_id);
CREATE INDEX IF NOT EXISTS resources_zone_id_idx ON resources (zone_id);

-- 4. Resource components (DAG composition for private rooms)
CREATE TABLE IF NOT EXISTS resource_components (
  parent_resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  child_resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_resource_id, child_resource_id),
  CONSTRAINT resource_components_no_self_containment CHECK (parent_resource_id <> child_resource_id)
);

CREATE INDEX IF NOT EXISTS resource_components_venue_id_idx ON resource_components (venue_id);

-- 5. Privileges for gamerbooker_app
GRANT SELECT, INSERT, UPDATE, DELETE ON
  rooms, zones, resources, resource_components
  TO gamerbooker_app;
