-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Allows tasks to target a PSQ, and lets a PSQ optionally link to a dashboard.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS psq_id int REFERENCES psqs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_psq_id ON tasks(psq_id);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_one_target;
ALTER TABLE tasks ADD CONSTRAINT tasks_one_target
   CHECK (num_nonnulls(dashboard_id, subscription_id, division_id, psq_id) = 1);

ALTER TABLE psqs ADD COLUMN IF NOT EXISTS dashboard_id int REFERENCES dashboards(id) ON DELETE SET NULL;

-- Data migration: convert each PSQ's existing free-text `tasks` into a structured
-- task row, then clear the free-text field so it isn't double-shown. The `psqs.tasks`
-- column itself is left in place (not dropped) — just stop surfacing it as a separate
-- field going forward; the structured task is now the source of truth for that text.
INSERT INTO tasks (psq_id, owner_analyst_id, created_by_id, title, status)
SELECT id, analyst_id, analyst_id, tasks, 'open'
FROM psqs
WHERE tasks IS NOT NULL AND btrim(tasks) <> '';
