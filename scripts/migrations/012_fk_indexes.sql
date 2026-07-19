-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds the missing foreign-key / filter indexes behind the Brain overview queries.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block — run these
-- statements one at a time (or via a client that does not wrap them in BEGIN/COMMIT).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_dashboard_id ON requests(dashboard_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_subscription_id ON requests(subscription_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_completed_date ON requests(completed_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_analyst_id ON dashboards(analyst_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_division_id ON dashboards(division_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_subscriptions_analyst_id ON report_subscriptions(analyst_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_subscriptions_division_id ON report_subscriptions(division_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_subscriptions_linked_dashboard_id ON report_subscriptions(linked_dashboard_id);
