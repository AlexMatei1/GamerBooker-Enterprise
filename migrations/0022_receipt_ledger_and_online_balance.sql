-- ENG-304: Offline receipt voiding & ledger enhancements.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

ALTER TABLE offline_receipts ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE offline_receipts ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE offline_receipts ADD COLUMN IF NOT EXISTS void_reason text;

CREATE INDEX IF NOT EXISTS offline_receipts_created_at_idx ON offline_receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS offline_receipts_voided_at_idx ON offline_receipts (voided_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON offline_receipts TO gamerbooker_app;
