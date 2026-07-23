-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds storage for the Clinician Guide "5-minute briefing" one-pager (app/api/clinician-guide/*).
-- The one-pager is synthesized in its own short (<10s) step after all pages are
-- described, then persisted here so the subsequent docx-build step can read it.

ALTER TABLE clinician_guide_jobs ADD COLUMN one_pager JSONB;
