-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds a nullable manual urgency override to dashboards and report subscriptions.
-- Values: 'high' | 'med' | 'low'; NULL = Auto (use the computed urgency formula).
-- Not enforced by a DB check constraint, matching the existing status/priority
-- convention (validated in the API layer instead).

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS manual_urgency text;
ALTER TABLE report_subscriptions ADD COLUMN IF NOT EXISTS manual_urgency text;
