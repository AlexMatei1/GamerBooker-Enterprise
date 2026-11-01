-- ENG-405: Booking packages with atomic availability and stock validation.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create packages table
CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  resource_type text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  fixed_price_minor bigint NOT NULL CHECK (fixed_price_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_venue_active_idx
  ON packages (venue_id, active);

-- 2. Create package_items table (consumable products included in the package)
CREATE TABLE IF NOT EXISTS package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity >= 1),
  allocated_price_minor bigint NOT NULL DEFAULT 0 CHECK (allocated_price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS package_items_package_idx
  ON package_items (package_id);

CREATE INDEX IF NOT EXISTS package_items_product_idx
  ON package_items (product_id);

-- 3. Extend price_quotes, holds, and bookings with package_id
ALTER TABLE price_quotes
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;

ALTER TABLE holds
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;

-- 4. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON packages TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON package_items TO gamerbooker_app;
GRANT SELECT, UPDATE ON price_quotes TO gamerbooker_app;
GRANT SELECT, UPDATE ON holds TO gamerbooker_app;
GRANT SELECT, UPDATE ON bookings TO gamerbooker_app;
