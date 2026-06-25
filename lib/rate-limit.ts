import { sql } from "@/lib/db";

const WINDOW_MINUTES = 10;
const MAX_REQUESTS_PER_WINDOW = 20;

function currentWindowStart(): Date {
  const windowMs = WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

export async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowStart = currentWindowStart();

  // Opportunistic cleanup of old windows, piggybacking on normal traffic
  // instead of needing a separate cron job.
  await sql`DELETE FROM api_rate_limits WHERE window_start < now() - interval '1 hour'`;

  const rows = await sql`
    INSERT INTO api_rate_limits (ip, window_start, request_count)
    VALUES (${ip}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (ip, window_start)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
    RETURNING request_count
  `;

  const requestCount = rows[0].request_count as number;
  if (requestCount > MAX_REQUESTS_PER_WINDOW) {
    const windowEndMs = windowStart.getTime() + WINDOW_MINUTES * 60 * 1000;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
