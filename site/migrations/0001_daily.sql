-- Daily aggregated events from Analytics Engine.
-- UPSERT-safe: running the cron twice for the same day accumulates instead of duplicating.
CREATE TABLE IF NOT EXISTS daily (
  day       TEXT    NOT NULL,  -- YYYY-MM-DD (Paraguay date, UTC-3)
  slug      TEXT    NOT NULL,
  ev        TEXT    NOT NULL,
  dish      TEXT    NOT NULL DEFAULT '',
  hour      INTEGER NOT NULL DEFAULT 0,
  src       TEXT    NOT NULL DEFAULT '',
  city      TEXT    NOT NULL DEFAULT '',
  count     INTEGER NOT NULL DEFAULT 0,
  sum_total REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (day, slug, ev, dish, hour, src, city)
);

CREATE INDEX IF NOT EXISTS idx_daily_slug_day ON daily (slug, day);
