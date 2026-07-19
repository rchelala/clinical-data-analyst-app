-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Backs the Clinician Guide docx generator (app/api/clinician-guide/*): tracks
-- per-page generation progress so the work can be split across many short
-- (<10s) requests instead of one long synchronous call, since Netlify's
-- free-tier functions hard-timeout at 10 seconds.

CREATE TABLE clinician_guide_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'processing', -- processing | done | failed
  report_title TEXT,
  overview TEXT,
  dashboard JSONB NOT NULL,
  pages_total INTEGER NOT NULL,
  pages_done INTEGER NOT NULL DEFAULT 0,
  guide_pages JSONB NOT NULL DEFAULT '[]',
  blob_pathname TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
