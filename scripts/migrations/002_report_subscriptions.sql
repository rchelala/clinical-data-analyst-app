-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Brings the already-live, already-seeded database up to the report_subscriptions
-- shape documented in scripts/schema.sql.

-- status: 'active' | 'maintenance' | 'retired' (not enforced by a DB enum/check constraint, documented only)
CREATE TABLE report_subscriptions (
   id                 serial PRIMARY KEY,
   name               text NOT NULL,
   division_id        int NOT NULL REFERENCES divisions(id),
   analyst_id         int REFERENCES analysts(id),
   stakeholder        text,
   status             text NOT NULL DEFAULT 'active',
   jira_ticket_id     text,
   last_touched_date  date NOT NULL DEFAULT CURRENT_DATE,
   created_date       date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE requests ALTER COLUMN dashboard_id DROP NOT NULL;

ALTER TABLE requests ADD COLUMN subscription_id int REFERENCES report_subscriptions(id) ON DELETE CASCADE;

ALTER TABLE requests ADD CONSTRAINT requests_owner_check CHECK (num_nonnulls(dashboard_id, subscription_id) = 1);
