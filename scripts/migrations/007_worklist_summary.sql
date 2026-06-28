-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds a free-form `summary` column to dashboards/report_subscriptions/psqs for
-- the Analyst Worklist feature. Also self-heals `worklist_status` on
-- dashboards/report_subscriptions for any DB that received an earlier
-- incomplete copy of 006 missing that column (idempotent no-op otherwise).

ALTER TABLE dashboards
   ADD COLUMN IF NOT EXISTS worklist_status text,
   ADD COLUMN IF NOT EXISTS summary         text;

ALTER TABLE report_subscriptions
   ADD COLUMN IF NOT EXISTS worklist_status text,
   ADD COLUMN IF NOT EXISTS summary         text;

ALTER TABLE psqs
   ADD COLUMN IF NOT EXISTS summary text;
