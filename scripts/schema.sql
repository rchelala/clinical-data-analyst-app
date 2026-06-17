-- ClinKit Dashboard Brain schema
-- Run manually against the target Neon Postgres instance.

CREATE TABLE analysts (
   id    serial PRIMARY KEY,
   name  text NOT NULL UNIQUE
);

CREATE TABLE divisions (
   id          serial PRIMARY KEY,
   name        text NOT NULL UNIQUE,
   sort_order  int  NOT NULL DEFAULT 0
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

-- request_type: 'feature' | 'bug' | 'field_request'; status: 'open' | 'in_progress' | 'done' (not enforced by a DB enum/check constraint, documented only)
CREATE TABLE requests (
   id              serial PRIMARY KEY,
   dashboard_id    int NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
   created_by_id   int NOT NULL REFERENCES analysts(id),
   title           text NOT NULL,
   description     text,
   request_type    text NOT NULL DEFAULT 'feature',
   status          text NOT NULL DEFAULT 'open',
   jira_ticket_id  text,
   created_date    date NOT NULL DEFAULT CURRENT_DATE,
   completed_date  date
);
