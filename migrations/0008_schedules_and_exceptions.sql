-- ENG-101: Operating schedules and exception calendar.
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

CREATE TABLE IF NOT EXISTS operating_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operating_schedules_venue_day_uniq UNIQUE (venue_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS operating_schedules_venue_id_idx ON operating_schedules (venue_id);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_venue_date_uniq UNIQUE (venue_id, date)
);

CREATE INDEX IF NOT EXISTS schedule_exceptions_venue_id_idx ON schedule_exceptions (venue_id);
CREATE INDEX IF NOT EXISTS schedule_exceptions_date_idx ON schedule_exceptions (date);

GRANT SELECT, INSERT, UPDATE, DELETE ON operating_schedules, schedule_exceptions TO gamerbooker_app;
