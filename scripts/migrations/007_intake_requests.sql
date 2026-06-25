-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds intake_requests: an "Unassigned" backlog of dashboard/subscription requests
-- that don't have an owning analyst yet (currently tracked in a spreadsheet outside
-- the app). fulfilled_entity_kind/fulfilled_entity_id are a soft pointer (not a real
-- FK, since the target table depends on the kind) recording what dashboard/subscription
-- this intake request became; both are set only when status = 'fulfilled', and that
-- invariant is enforced at the API layer, not the DB.

CREATE TABLE intake_requests (
  id              serial PRIMARY KEY,
  priority        text NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
  date_received   date NOT NULL DEFAULT CURRENT_DATE,
  division_id     int REFERENCES divisions(id) ON DELETE SET NULL,
  topic           text NOT NULL,
  stakeholder     text,
  analyst_id      int REFERENCES analysts(id) ON DELETE SET NULL,
  requested_kind  text CHECK (requested_kind IN ('dashboard', 'subscription')),
  status          text NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'discovery', 'ready', 'in_progress', 'on_hold', 'fulfilled')),
  ticket_link     text,
  internal_comments text,
  created_date    date NOT NULL DEFAULT CURRENT_DATE,
  fulfilled_entity_kind text CHECK (fulfilled_entity_kind IN ('dashboard', 'subscription')),
  fulfilled_entity_id   int
);
