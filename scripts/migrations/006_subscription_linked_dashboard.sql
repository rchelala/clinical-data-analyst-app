-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds an optional link from a report subscription to a dashboard in the same
-- division, so a subscription can express "this goes hand-in-hand with this
-- dashboard." ON DELETE SET NULL: deleting a dashboard unlinks any
-- subscriptions pointing at it rather than deleting them. Same-division
-- enforcement is validated at the API layer, not the DB.

ALTER TABLE report_subscriptions ADD COLUMN linked_dashboard_id int REFERENCES dashboards(id) ON DELETE SET NULL;
