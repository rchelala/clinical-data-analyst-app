-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Tracks who created a division, so a brand-new, still-empty division is
-- visible to its creator (to add the first dashboard/subscription) without
-- being visible to every other analyst.

ALTER TABLE divisions ADD COLUMN created_by_analyst_id int REFERENCES analysts(id);
