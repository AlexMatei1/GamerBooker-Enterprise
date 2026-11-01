-- ENG-403: Bar board queue, order state machine lifecycle, and handoff tracking.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Extend orders table with lifecycle timestamps and actor tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepared_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepared_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handed_off_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handed_off_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_prep_minutes integer NOT NULL DEFAULT 10;

-- 2. Index for bar board real-time queue queries
CREATE INDEX IF NOT EXISTS orders_bar_board_queue_idx
  ON orders (venue_id, status, created_at ASC)
  WHERE status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY');

-- 3. Grant privileges to least-privilege gamerbooker_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO gamerbooker_app;
