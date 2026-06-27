-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds the data layer for the Analyst Worklist feature: free-form worklist columns
-- on dashboards/report_subscriptions, a per-analyst worklist of dashboards, a
-- standalone tasks table (with an assignee), PSQs (mirrors the Excel PSQ tracker),
-- and weekly meeting notes.

ALTER TABLE dashboards
   ADD COLUMN IF NOT EXISTS priority           text,
   ADD COLUMN IF NOT EXISTS enterprise_analyst text,
   ADD COLUMN IF NOT EXISTS comments           text,
   ADD COLUMN IF NOT EXISTS notes              text;

ALTER TABLE report_subscriptions
   ADD COLUMN IF NOT EXISTS priority           text,
   ADD COLUMN IF NOT EXISTS enterprise_analyst text,
   ADD COLUMN IF NOT EXISTS comments           text,
   ADD COLUMN IF NOT EXISTS notes              text;

-- Which dashboards are on an analyst's worklist.
CREATE TABLE worklist_dashboards (
   id           serial PRIMARY KEY,
   analyst_id   int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   dashboard_id int  NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
   added_date   date NOT NULL DEFAULT CURRENT_DATE,
   UNIQUE (analyst_id, dashboard_id)
);

CREATE INDEX idx_worklist_dashboards_dashboard_id ON worklist_dashboards(dashboard_id);

-- Backfill: one worklist row per existing dashboard for its owner.
INSERT INTO worklist_dashboards (analyst_id, dashboard_id)
SELECT analyst_id, id FROM dashboards WHERE analyst_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- status: 'open' | 'in_progress' | 'done' plus custom values; priority is free-form
-- (not enforced by a DB enum/check constraint, documented only). Standalone category
-- with its own assignee (owner_analyst_id), distinct from the dashboard's owner.
CREATE TABLE tasks (
   id               serial PRIMARY KEY,
   dashboard_id     int  NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
   owner_analyst_id int  REFERENCES analysts(id),
   created_by_id    int  NOT NULL REFERENCES analysts(id),
   title            text NOT NULL,
   description      text,
   status           text NOT NULL DEFAULT 'open',
   priority         text,
   created_date     date NOT NULL DEFAULT CURRENT_DATE,
   completed_date   date
);

CREATE INDEX idx_tasks_dashboard_id ON tasks(dashboard_id);
CREATE INDEX idx_tasks_owner_analyst_id ON tasks(owner_analyst_id);

-- Mirrors the Excel PSQ columns. status is free-form, e.g. '60%' / 'completed'
-- (not enforced by a DB enum/check constraint, documented only).
CREATE TABLE psqs (
   id                 serial PRIMARY KEY,
   analyst_id         int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   division_id        int  REFERENCES divisions(id),
   year               int,
   name               text NOT NULL,
   status             text,
   tasks              text,
   comments           text,
   notes              text,
   enterprise_analyst text,
   created_date       date NOT NULL DEFAULT CURRENT_DATE,
   last_touched_date  date NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_psqs_analyst_id ON psqs(analyst_id);

-- "Meetings this week" notes, one row per analyst per week.
CREATE TABLE weekly_notes (
   id         serial PRIMARY KEY,
   analyst_id int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   week_start date NOT NULL,
   meetings   text,
   UNIQUE (analyst_id, week_start)
);
