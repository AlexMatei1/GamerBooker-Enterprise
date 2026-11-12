-- 0034: cafe_applications.form_data
--
-- The intake approval flow (src/platform-access/access.service.ts) reads and
-- writes the raw Google Form answers on the application row: station count,
-- standard/VIP hourly rates, operating schedule, amenities and the generated
-- temporary owner password. Migration 0033 created the table without this
-- column, so a fresh database could not run the approval flow.
--
-- Additive and idempotent: existing rows keep an empty object.
ALTER TABLE cafe_applications
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb;
