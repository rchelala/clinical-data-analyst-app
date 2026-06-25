-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Backs lib/rate-limit.ts: tracks per-IP request counts in fixed 10-minute
-- windows so the AI-calling routes can reject sustained abuse without
-- requiring any login. window_start is always truncated to a 10-minute
-- boundary (see currentWindowStart() in lib/rate-limit.ts).

CREATE TABLE api_rate_limits (
  ip TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, window_start)
);
