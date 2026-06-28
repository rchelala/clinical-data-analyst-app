-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Generalizes tasks to attach to exactly one of: dashboard, report subscription, or division.

ALTER TABLE tasks ALTER COLUMN dashboard_id DROP NOT NULL;

ALTER TABLE tasks
   ADD COLUMN IF NOT EXISTS subscription_id int REFERENCES report_subscriptions(id) ON DELETE CASCADE,
   ADD COLUMN IF NOT EXISTS division_id      int REFERENCES divisions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_subscription_id ON tasks(subscription_id);
CREATE INDEX IF NOT EXISTS idx_tasks_division_id ON tasks(division_id);

-- Guard the CHECK constraint add so re-running this file is a no-op if already applied.
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'tasks_one_target'
   ) THEN
      ALTER TABLE tasks ADD CONSTRAINT tasks_one_target
         CHECK (num_nonnulls(dashboard_id, subscription_id, division_id) = 1);
   END IF;
END $$;
