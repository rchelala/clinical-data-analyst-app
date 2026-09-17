-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds indexes for query patterns that were scanning without one: date-range
-- filters/sorts on tasks and the two job tables, owner+parent lookups on
-- tasks, and creator lookups on requests/tasks.
--
-- Plain CREATE INDEX IF NOT EXISTS (not CONCURRENTLY) is used here because
-- the Neon HTTP driver used by this app (lib/db.ts, @neondatabase/serverless)
-- cannot run CREATE INDEX CONCURRENTLY inside a transaction, and these
-- statements are expected to be applied as a batch. If you're running this
-- file by hand via psql against a table with meaningful production traffic,
-- prefer CREATE INDEX CONCURRENTLY (one statement at a time, outside a
-- transaction block) to avoid holding a write lock on the table — see
-- migrations/012_fk_indexes.sql for that pattern.
--
-- Not included here: requests.title is searched with ILIKE '%...%'
-- (app/api/requests/search/route.ts) — a pg_trgm GIN index would help that,
-- but it requires `CREATE EXTENSION pg_trgm`, which this migration
-- deliberately does not add. That route also does not escape literal
-- `%`/`_` in the search term before building the ILIKE pattern; left as a
-- follow-up, not addressed by this migration.

CREATE INDEX IF NOT EXISTS idx_tasks_created_date ON tasks(created_date);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_date ON tasks(completed_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_analyst_id_psq_id ON tasks(owner_analyst_id, psq_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_analyst_id_dashboard_id ON tasks(owner_analyst_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);

CREATE INDEX IF NOT EXISTS idx_requests_created_by_id ON requests(created_by_id);

CREATE INDEX IF NOT EXISTS idx_psqs_dashboard_id ON psqs(dashboard_id);

-- Helps lib/rate-limit.ts's cleanup DELETE (window_start < ...), which can't
-- use the (ip, window_start) primary key since window_start isn't its
-- leading column.
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);

CREATE INDEX IF NOT EXISTS idx_clinician_guide_jobs_created_at ON clinician_guide_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_cmio_review_jobs_created_at ON cmio_review_jobs(created_at);
