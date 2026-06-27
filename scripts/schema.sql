-- ClinKit Dashboard Brain schema
-- Run manually against the target Neon Postgres instance.

CREATE TABLE analysts (
   id    serial PRIMARY KEY,
   name  text NOT NULL UNIQUE
);

CREATE TABLE divisions (
   id                    serial PRIMARY KEY,
   name                  text NOT NULL UNIQUE,
   sort_order            int  NOT NULL DEFAULT 0,
   created_by_analyst_id int REFERENCES analysts(id)
);

-- status: 'active' | 'maintenance' | 'retired' (not enforced by a DB enum/check constraint, documented only)
CREATE TABLE dashboards (
   id                 serial PRIMARY KEY,
   name               text NOT NULL,
   division_id        int NOT NULL REFERENCES divisions(id),
   analyst_id         int REFERENCES analysts(id),
   stakeholder        text,
   status             text NOT NULL DEFAULT 'active',
   jira_ticket_id     text,
   last_touched_date  date NOT NULL DEFAULT CURRENT_DATE,
   created_date       date NOT NULL DEFAULT CURRENT_DATE,
   priority           text,
   enterprise_analyst text,
   comments           text,
   notes              text
);

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
   created_date       date NOT NULL DEFAULT CURRENT_DATE,
   priority           text,
   enterprise_analyst text,
   comments           text,
   notes              text
);

-- request_type: 'feature' | 'bug' | 'field_request'; status: 'open' | 'in_progress' | 'done' (not enforced by a DB enum/check constraint, documented only)
CREATE TABLE requests (
   id              serial PRIMARY KEY,
   dashboard_id    int REFERENCES dashboards(id) ON DELETE CASCADE,
   subscription_id int REFERENCES report_subscriptions(id) ON DELETE CASCADE,
   created_by_id   int NOT NULL REFERENCES analysts(id),
   title           text NOT NULL,
   description     text,
   request_type    text NOT NULL DEFAULT 'feature',
   status          text NOT NULL DEFAULT 'open',
   jira_ticket_id  text,
   created_date    date NOT NULL DEFAULT CURRENT_DATE,
   completed_date  date,
   attachment_url      text,
   attachment_filename text,
   CHECK (num_nonnulls(dashboard_id, subscription_id) = 1)
);

-- Which dashboards are on an analyst's worklist.
CREATE TABLE worklist_dashboards (
   id           serial PRIMARY KEY,
   analyst_id   int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   dashboard_id int  NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
   added_date   date NOT NULL DEFAULT CURRENT_DATE,
   UNIQUE (analyst_id, dashboard_id)
);

CREATE INDEX idx_worklist_dashboards_dashboard_id ON worklist_dashboards(dashboard_id);

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
