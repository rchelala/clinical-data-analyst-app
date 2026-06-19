-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds optional file-attachment support to requests (e.g. a previously-built
-- Excel field request uploaded to Vercel Blob).

ALTER TABLE requests ADD COLUMN attachment_url text;
ALTER TABLE requests ADD COLUMN attachment_filename text;
