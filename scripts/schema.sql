-- ClinKit Dashboard Brain schema
-- Run manually against the target Neon Postgres instance.

CREATE TABLE analysts (
   id         serial PRIMARY KEY,
   name       text NOT NULL UNIQUE,
   -- Retired analysts stay in the table so every FK that points at them keeps
   -- resolving; they just drop out of the pickers. See migration 018.
   is_active  boolean NOT NULL DEFAULT true
);

-- Stops "Becca" and "becca" becoming two people: name is the only identity
-- this app has, so a casing split would be permanent.
CREATE UNIQUE INDEX analysts_name_lower_key ON analysts (lower(name));

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
   notes              text,
   -- free-form worklist work-status, separate from the status lifecycle enum above
   worklist_status    text,
   summary            text,
   -- manual urgency override: 'high' | 'med' | 'low'; NULL = Auto (use computed formula)
   manual_urgency     text
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
   created_date         date NOT NULL DEFAULT CURRENT_DATE,
   priority             text,
   enterprise_analyst   text,
   comments             text,
   notes                text,
   -- free-form worklist work-status, separate from the status lifecycle enum above
   worklist_status      text,
   summary              text,
   -- manual urgency override: 'high' | 'med' | 'low'; NULL = Auto (use computed formula)
   manual_urgency       text
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
   field_names         jsonb,
   CHECK (num_nonnulls(dashboard_id, subscription_id) = 1)
);

CREATE INDEX idx_requests_dashboard_id ON requests(dashboard_id);
CREATE INDEX idx_requests_subscription_id ON requests(subscription_id);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_completed_date ON requests(completed_date);
CREATE INDEX idx_requests_created_by_id ON requests(created_by_id);
CREATE INDEX idx_dashboards_analyst_id ON dashboards(analyst_id);
CREATE INDEX idx_dashboards_division_id ON dashboards(division_id);
CREATE INDEX idx_report_subscriptions_analyst_id ON report_subscriptions(analyst_id);
CREATE INDEX idx_report_subscriptions_division_id ON report_subscriptions(division_id);
CREATE INDEX idx_report_subscriptions_linked_dashboard_id ON report_subscriptions(linked_dashboard_id);

CREATE TABLE tags (
   id    serial PRIMARY KEY,
   -- name is stored lowercase; trim/lowercase normalization happens in the API layer, not the DB
   name  text NOT NULL UNIQUE
);

CREATE TABLE request_tags (
   request_id int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   tag_id     int NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
   PRIMARY KEY (request_id, tag_id)
);

-- Self-referential many-to-many table for bidirectional "related request" links.
-- A pair of requests is always stored as a single row with the lower id in
-- request_id_a; the CHECK constraint enforces this ordering (and rejects self-links).
-- The API layer must normalize operand order on every write since the DB won't reorder for you.
CREATE TABLE request_links (
   request_id_a int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   request_id_b int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   created_date  date NOT NULL DEFAULT CURRENT_DATE,
   CHECK (request_id_a < request_id_b),
   PRIMARY KEY (request_id_a, request_id_b)
);

CREATE INDEX idx_request_tags_tag_id ON request_tags(tag_id);
CREATE INDEX idx_request_links_b ON request_links(request_id_b);

-- Which dashboards are on an analyst's worklist.
CREATE TABLE worklist_dashboards (
   id           serial PRIMARY KEY,
   analyst_id   int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   dashboard_id int  NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
   added_date   date NOT NULL DEFAULT CURRENT_DATE,
   UNIQUE (analyst_id, dashboard_id)
);

CREATE INDEX idx_worklist_dashboards_dashboard_id ON worklist_dashboards(dashboard_id);

-- Mirrors the Excel PSQ columns. status is free-form, e.g. '60%' / 'completed'
-- (not enforced by a DB enum/check constraint, documented only). Defined before
-- tasks because tasks.psq_id references it.
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
   summary            text,
   created_date       date NOT NULL DEFAULT CURRENT_DATE,
   last_touched_date  date NOT NULL DEFAULT CURRENT_DATE,
   dashboard_id       int REFERENCES dashboards(id) ON DELETE SET NULL
);

CREATE INDEX idx_psqs_analyst_id ON psqs(analyst_id);
CREATE INDEX idx_psqs_dashboard_id ON psqs(dashboard_id);

-- status: 'open' | 'in_progress' | 'done' plus custom values; priority is free-form
-- (not enforced by a DB enum/check constraint, documented only). Standalone category
-- with its own assignee (owner_analyst_id), distinct from the dashboard's owner.
-- A task attaches to exactly one of: a dashboard, a report subscription, a
-- division (the "standalone" home for work not tied to a dashboard/subscription),
-- or a psq.
CREATE TABLE tasks (
   id               serial PRIMARY KEY,
   dashboard_id     int  REFERENCES dashboards(id) ON DELETE CASCADE,
   subscription_id  int  REFERENCES report_subscriptions(id) ON DELETE CASCADE,
   division_id      int  REFERENCES divisions(id) ON DELETE CASCADE,
   psq_id           int  REFERENCES psqs(id) ON DELETE CASCADE,
   owner_analyst_id int  REFERENCES analysts(id),
   created_by_id    int  NOT NULL REFERENCES analysts(id),
   title            text NOT NULL,
   description      text,
   status           text NOT NULL DEFAULT 'open',
   priority         text,
   created_date     date NOT NULL DEFAULT CURRENT_DATE,
   completed_date   date,
   resolution_comment text, -- optional free-text note captured when the task is completed
   CHECK (num_nonnulls(dashboard_id, subscription_id, division_id, psq_id) = 1)
);

CREATE INDEX idx_tasks_dashboard_id ON tasks(dashboard_id);
CREATE INDEX idx_tasks_subscription_id ON tasks(subscription_id);
CREATE INDEX idx_tasks_division_id ON tasks(division_id);
CREATE INDEX idx_tasks_psq_id ON tasks(psq_id);
CREATE INDEX idx_tasks_owner_analyst_id ON tasks(owner_analyst_id);
CREATE INDEX idx_tasks_created_date ON tasks(created_date);
CREATE INDEX idx_tasks_completed_date ON tasks(completed_date);
CREATE INDEX idx_tasks_owner_analyst_id_psq_id ON tasks(owner_analyst_id, psq_id);
CREATE INDEX idx_tasks_owner_analyst_id_dashboard_id ON tasks(owner_analyst_id, dashboard_id);
CREATE INDEX idx_tasks_created_by_id ON tasks(created_by_id);

-- "Meetings this week" notes, one row per analyst per week.
CREATE TABLE weekly_notes (
   id         serial PRIMARY KEY,
   analyst_id int  NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
   week_start date NOT NULL,
   meetings   text,
   UNIQUE (analyst_id, week_start)
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

-- Backs lib/rate-limit.ts: tracks per-IP request counts in fixed 10-minute
-- windows so the AI-calling routes can reject sustained abuse without
-- requiring any login. window_start is always truncated to a 10-minute
-- boundary (see currentWindowStart() in lib/rate-limit.ts).
CREATE TABLE api_rate_limits (
   ip            text NOT NULL,
   window_start  timestamptz NOT NULL,
   request_count int  NOT NULL DEFAULT 1,
   PRIMARY KEY (ip, window_start)
);

-- Helps the cleanup DELETE (window_start < ...) in lib/rate-limit.ts, which
-- can't use the (ip, window_start) primary key since window_start isn't its
-- leading column.
CREATE INDEX idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Backs the Clinician Guide docx generator (app/api/clinician-guide/*): tracks
-- per-page generation progress so the work can be split across many short
-- (<10s) requests instead of one long synchronous call, since Netlify's
-- free-tier functions hard-timeout at 10 seconds. one_pager holds the
-- synthesized "5-minute briefing" one-pager, added after the rest of the job.
CREATE TABLE clinician_guide_jobs (
   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   status        text NOT NULL DEFAULT 'processing', -- processing | done | failed
   report_title  text,
   overview      text,
   dashboard     jsonb NOT NULL,
   pages_total   int   NOT NULL,
   pages_done    int   NOT NULL DEFAULT 0,
   guide_pages   jsonb NOT NULL DEFAULT '[]',
   blob_pathname text,
   error         text,
   one_pager     jsonb,
   created_at    timestamptz NOT NULL DEFAULT now(),
   updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clinician_guide_jobs_created_at ON clinician_guide_jobs(created_at);

-- Backs the CMIO Review tab (app/api/cmio-review/*): turns a meeting transcript
-- into rows appended to the canonical CMIO_Weekly_Review Excel tracker.
--
-- cmio_tracker holds a pointer to the single canonical, versioned workbook
-- (bytes live in Vercel Blob; this row just tracks the current pointer/version).
CREATE TABLE cmio_tracker (
   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   blob_pathname text NOT NULL,
   filename      text NOT NULL DEFAULT 'CMIO_Weekly_Review.xlsx',
   version       int  NOT NULL UNIQUE DEFAULT 1,
   updated_at    timestamptz NOT NULL DEFAULT now(),
   created_at    timestamptz NOT NULL DEFAULT now()
);

-- cmio_review_jobs tracks one transcript-extraction job, processed across
-- several short requests (one Claude call per chunk per request) to stay
-- under Netlify's ~26s function timeout, modeled on clinician_guide_jobs.
CREATE TABLE cmio_review_jobs (
   id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   status         text NOT NULL DEFAULT 'processing', -- processing | done | failed
   mode           text NOT NULL, -- append | standalone
   meeting_date   date,
   transcript     text NOT NULL,
   chunks_total   int  NOT NULL,
   chunks_done    int  NOT NULL DEFAULT 0,
   rows           jsonb NOT NULL DEFAULT '[]', -- accumulated ExtractedRow[]
   blob_pathname  text, -- final .xlsx once status=done
   result_version int,  -- cmio_tracker.version this produced (append mode)
   notes          jsonb NOT NULL DEFAULT '[]', -- controller flags (judgment calls, dupes, omissions)
   error          text,
   created_at     timestamptz NOT NULL DEFAULT now(),
   updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cmio_review_jobs_created_at ON cmio_review_jobs(created_at);
