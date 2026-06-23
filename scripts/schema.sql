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
