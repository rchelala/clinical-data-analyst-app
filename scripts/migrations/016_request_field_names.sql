-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Persists the list of field names captured on a "New Field Request" attachment.

ALTER TABLE requests ADD COLUMN IF NOT EXISTS field_names jsonb;
