-- ENG-302: Group payments, per-payer intents, and compensating refunds.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS group_booking_id uuid REFERENCES group_bookings(id) ON DELETE SET NULL;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS group_participant_id uuid REFERENCES group_participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_intents_group_booking_id_idx ON payment_intents(group_booking_id);
CREATE INDEX IF NOT EXISTS payment_intents_group_participant_id_idx ON payment_intents(group_participant_id);

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS group_booking_id uuid REFERENCES group_bookings(id) ON DELETE SET NULL;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS refunds_group_booking_id_idx ON refunds(group_booking_id);
CREATE INDEX IF NOT EXISTS refunds_payment_intent_id_idx ON refunds(payment_intent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_intents, refunds TO gamerbooker_app;
