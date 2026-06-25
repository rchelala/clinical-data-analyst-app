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
   created_date       date NOT NULL DEFAULT CURRENT_DATE
);

-- status: 'active' | 'maintenance' | 'retired' (not enforced by a DB enum/check constraint, documented only)
CREATE TABLE report_subscriptions (
   id                   serial PRIMARY KEY,
   name                 text NOT NULL,
   division_id          int NOT NULL REFERENCES divisions(id),
   analyst_id           int REFERENCES analysts(id),
   linked_dashboard_id  int REFERENCES dashboards(id) ON DELETE SET NULL,
   stakeholder          text,
   status               text NOT NULL DEFAULT 'active',
   jira_ticket_id       text,
   last_touched_date    date NOT NULL DEFAULT CURRENT_DATE,
   created_date         date NOT NULL DEFAULT CURRENT_DATE
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

-- intake_requests: "Unassigned" backlog of dashboard/subscription requests with no
-- owning analyst yet. Unlike the status/type columns above, priority/requested_kind/
-- status/fulfilled_entity_kind ARE enforced via DB CHECK constraints here -- see
-- migrations/007_intake_requests.sql for rationale.
CREATE TABLE intake_requests (
   id                serial PRIMARY KEY,
   priority          text NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
   date_received     date NOT NULL DEFAULT CURRENT_DATE,
   division_id       int REFERENCES divisions(id) ON DELETE SET NULL,
   topic             text NOT NULL,
   stakeholder       text,
   analyst_id        int REFERENCES analysts(id) ON DELETE SET NULL,
   requested_kind    text CHECK (requested_kind IN ('dashboard', 'subscription')),
   status            text NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started', 'discovery', 'ready', 'in_progress', 'on_hold', 'fulfilled')),
   ticket_link       text,
   internal_comments text,
   created_date      date NOT NULL DEFAULT CURRENT_DATE,
   fulfilled_entity_kind text CHECK (fulfilled_entity_kind IN ('dashboard', 'subscription')),
   fulfilled_entity_id   int
);
