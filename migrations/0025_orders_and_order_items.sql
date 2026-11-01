-- ENG-402: Consumables orders, order items, and checkout tracking.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_type text NOT NULL CHECK (order_type IN ('PREORDER', 'IN_SESSION')),
  fulfillment_mode text NOT NULL CHECK (fulfillment_mode IN ('AT_STATION', 'BAR_PICKUP')),
  target_resource_id uuid REFERENCES resources(id) ON DELETE SET NULL,
  pickup_code text,
  status text NOT NULL DEFAULT 'PAYMENT_PENDING'
    CHECK (status IN ('DRAFT', 'PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED_OFF', 'CANCELLED')),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  currency text NOT NULL DEFAULT 'RON',
  payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL,
  age_verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  age_verified_at timestamptz,
  cancellation_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_venue_status_idx
  ON orders (venue_id, status);

CREATE INDEX IF NOT EXISTS orders_booking_id_idx
  ON orders (booking_id);

CREATE INDEX IF NOT EXISTS orders_customer_id_idx
  ON orders (customer_id);

CREATE INDEX IF NOT EXISTS orders_created_venue_idx
  ON orders (venue_id, created_at DESC);

-- 2. Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title text NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0),
  quantity integer NOT NULL CHECK (quantity >= 1),
  line_total_minor bigint NOT NULL CHECK (line_total_minor > 0),
  restricted_product_type text NOT NULL DEFAULT 'NONE',
  age_verification_required boolean NOT NULL DEFAULT false,
  tax_category text NOT NULL DEFAULT 'STANDARD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items (order_id);

CREATE INDEX IF NOT EXISTS order_items_product_id_idx
  ON order_items (product_id);

-- 3. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO gamerbooker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_items TO gamerbooker_app;
