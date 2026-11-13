CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- SHA-256 of the push endpoint
  endpoint TEXT NOT NULL,       -- where the browser's push service listens
  time TEXT NOT NULL,           -- 'HH:MM' local reminder time
  tz TEXT NOT NULL,             -- e.g. 'Europe/London'
  last_sent TEXT,               -- app day (YYYY-MM-DD) a reminder was last sent
  skip_date TEXT,               -- app day the app said was already rated
  updated INTEGER NOT NULL      -- ms; refreshed every time the app opens
);
