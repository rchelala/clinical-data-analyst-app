-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds an optional free-text note captured when a task is resolved/completed.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resolution_comment text;
