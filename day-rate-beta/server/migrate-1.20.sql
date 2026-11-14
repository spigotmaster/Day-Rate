-- Existing installs only (fresh installs get this column from schema.sql). Run once:
-- npx wrangler d1 execute day-rate-reminders --remote --file=migrate-1.20.sql
ALTER TABLE subs ADD COLUMN weekly INTEGER NOT NULL DEFAULT 0;
