-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Backs the CMIO Review tab (app/api/cmio-review/*): turns a meeting transcript
-- into rows appended to the canonical CMIO_Weekly_Review Excel tracker.
--
-- cmio_tracker holds a pointer to the single canonical, versioned workbook
-- (bytes live in Vercel Blob; this row just tracks the current pointer/version).
--
-- cmio_review_jobs tracks one transcript-extraction job, processed across
-- several short requests (Sonnet, one Claude call per chunk per request) to
-- stay under Netlify's ~26s function timeout, modeled on clinician_guide_jobs.

CREATE TABLE cmio_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_pathname TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT 'CMIO_Weekly_Review.xlsx',
  version INTEGER NOT NULL UNIQUE DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cmio_review_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'processing', -- processing | done | failed
  mode TEXT NOT NULL, -- append | standalone
  meeting_date DATE,
  transcript TEXT NOT NULL,
  chunks_total INTEGER NOT NULL,
  chunks_done INTEGER NOT NULL DEFAULT 0,
  rows JSONB NOT NULL DEFAULT '[]', -- accumulated ExtractedRow[]
  blob_pathname TEXT, -- final .xlsx once status=done
  result_version INTEGER, -- cmio_tracker.version this produced (append mode)
  notes JSONB NOT NULL DEFAULT '[]', -- controller flags (judgment calls, dupes, omissions)
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
