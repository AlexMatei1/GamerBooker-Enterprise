-- ENG-401: Consumables menu catalog, categories, products, image assets, and stock movements.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Menu categories table
CREATE TABLE IF NOT EXISTS menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_categories_venue_name_uniq UNIQUE (venue_id, name)
);

CREATE INDEX IF NOT EXISTS menu_categories_venue_idx
  ON menu_categories (venue_id, sort_order ASC, name ASC);

-- 2. Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category_id uuid REFERENCES menu_categories(id) ON DELETE SET NULL,
  sku text,
  title text NOT NULL,
  description text,
  image_url text,
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  tax_category text NOT NULL DEFAULT 'STANDARD'
    CHECK (tax_category IN ('STANDARD', 'REDUCED', 'EXEMPT')),
  active boolean NOT NULL DEFAULT true,
  inventory_tracking boolean NOT NULL DEFAULT false,
  stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  max_qty integer NOT NULL DEFAULT 10 CHECK (max_qty >= min_qty),
  preparation_minutes integer NOT NULL DEFAULT 0 CHECK (preparation_minutes >= 0),
  fulfillment_methods text[] NOT NULL DEFAULT ARRAY['AT_STATION', 'BAR_PICKUP']::text[],
  restricted_product_type text NOT NULL DEFAULT 'NONE'
    CHECK (restricted_product_type IN ('NONE', 'ENERGY_DRINK', 'ALCOHOL', 'AGE_RESTRICTED')),
  age_verification_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_venue_sku_uniq
  ON products (venue_id, lower(sku))
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_venue_active_idx
  ON products (venue_id, active);

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products (category_id);

-- 3. Stock movements audit ledger
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type text NOT NULL
    CHECK (movement_type IN (
      'INITIAL_STOCK', 'RESTOCK', 'ADJUSTMENT', 'RESERVATION_HOLD',
      'RESERVATION_RELEASE', 'ORDER_DEDUCT', 'RETURN_RESTOCK', 'DAMAGE_WASTE'
    )),
  quantity_delta integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_venue_idx
  ON stock_movements (venue_id, created_at DESC);

-- 4. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON menu_categories TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO gamerbooker_app;
