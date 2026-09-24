-- 018: retireable analysts
-- Run manually against the target Neon Postgres instance.
--
-- Analysts were seeded once (scripts/seed.ts) and never editable from the app.
-- is_active lets someone who leaves the team drop out of every picker while all
-- of their tasks, dashboards and history stay intact and still render their name.
--
-- The lower(name) index is what stops "Becca" and "becca" becoming two people:
-- name is the only identity this app has, so a casing split would be permanent.

ALTER TABLE analysts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS analysts_name_lower_key ON analysts (lower(name));
