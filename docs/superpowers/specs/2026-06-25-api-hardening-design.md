# API Hardening: Rate Limiting, Error Sanitization, Blob Naming

## Overview

Three targeted fixes from a security/architecture review, scoped deliberately
narrow: no authentication is being added (the app stays fully open by
design — analysts are meant to see/edit each other's data, and outside
access is acceptable). The remaining concern is unauthenticated abuse of paid
AI API calls and accidental information disclosure, both of which are fixable
without any login system.

1. Rate-limit the four AI-calling routes against cost-abuse.
2. Stop returning raw exception messages to API clients.
3. Make uploaded attachment blob paths unguessable.

## 1. Rate limiting

**New table** (migration via existing scripts/ convention — see `scripts/`
for how prior migrations were run):

```sql
CREATE TABLE api_rate_limits (
  ip TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, window_start)
);
```

Fixed 10-minute windows (`window_start` truncated to the nearest 10-minute
boundary), not sliding — simpler, and precision doesn't matter for abuse
detection at this threshold.

**New `lib/rate-limit.ts`:**

```ts
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>
```

- Computes the current 10-minute window boundary for `window_start`.
- `INSERT ... ON CONFLICT (ip, window_start) DO UPDATE SET request_count = request_count + 1 RETURNING request_count`.
- If `request_count > 20`, returns `{ allowed: false, retryAfterSeconds: <seconds until window ends> }`.
- Otherwise `{ allowed: true, retryAfterSeconds: 0 }`.
- Before the upsert, opportunistically runs `DELETE FROM api_rate_limits WHERE window_start < now() - interval '1 hour'` so the table doesn't grow unbounded. No cron job — this piggybacks on normal traffic.

**IP extraction:** new small helper `getClientIp(req: NextRequest): string`
reading `x-forwarded-for` (first entry) with a fallback of `"unknown"` if
absent — Vercel always sets this in production, but local dev won't, and
`"unknown"` just becomes one shared bucket for all local requests.

**Applied to:** `app/api/comment/route.ts`, `app/api/generate-sql/route.ts`,
`app/api/it-reference/route.ts`, `app/api/clinician-guide/route.ts`. Each
route calls `checkRateLimit(getClientIp(req))` as the first line inside
`POST`, before any other work. On `allowed: false`, returns:

```ts
NextResponse.json(
  { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
  { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
)
```

**Limit:** 20 requests / 10 minutes per IP, shared across all four routes
combined (one counter per IP, not per route) — simplest to reason about, and
the abuse case (bill exhaustion) cares about total AI-call volume, not which
specific endpoint.

## 2. Error message sanitization

Pattern repeated in every route's catch block today:

```ts
} catch (err: unknown) {
  console.error("X error:", err);
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  return NextResponse.json({ error: message }, { status: 500 });
}
```

Change: keep the `console.error` (server-side log, unchanged), but always
return a fixed generic message on the `500` path:

```ts
} catch (err: unknown) {
  console.error("X error:", err);
  return NextResponse.json(
    { error: "Something went wrong processing your request. Please try again." },
    { status: 500 }
  );
}
```

**Scope:** every route currently doing `err instanceof Error ? err.message : ...`
passthrough into a client response. This is a mechanical find-and-replace
across route files — no shared helper needed since the pattern is a one-line
change per catch block and forcing an abstraction here would be more
indirection than the problem warrants.

**Not in scope:** the existing `400`-status validation responses (missing
field, oversized input, bad extension, etc.) — those are intentional,
developer-written, safe-to-show messages and stay exactly as they are. Only
the `500`/catch-block "something unexpected broke" messages change.

## 3. Blob pathname randomization

`app/api/requests/attachment/route.ts:25`:

```ts
// before
const blob = await put(`request-attachments/${Date.now()}-${file.name}`, file, { access: 'private' });

// after
const blob = await put(`request-attachments/${crypto.randomUUID()}-${file.name}`, file, { access: 'private' });
```

`crypto.randomUUID()` is available globally in the Next.js Node/Edge runtime,
no new import needed. No changes required to the download route — it already
just takes whatever pathname it's given.

## Testing

- `lib/rate-limit.ts`: unit test with a mocked/test Postgres connection (or
  the project's existing test DB pattern, if any — check `scripts/` and
  existing test setup before introducing a new approach) covering: under
  limit allows, at limit blocks, window rollover resets, old-window cleanup
  deletes expected rows.
- Route-level: manual verification (curl loop hitting `/api/comment` 21
  times, confirming the 21st returns 429) since these are thin wrappers
  around the tested `checkRateLimit` function.
- Error sanitization: manual check per route — trigger a real error path
  (e.g. malformed JSON body) and confirm the response body no longer
  contains the raw exception text.
- Blob naming: manual check — upload an attachment, confirm the stored
  pathname contains a UUID, not a timestamp.

## Out of scope (explicitly deferred, per user decision)

- Authentication/authorization of any kind — the app is intentionally fully
  open, including cross-analyst access.
- The architecture cleanup items from the review (shared data-access layer,
  decomposing large route handlers/page components) — separate effort, not
  bundled here.
- PowerBI access token exposure to the browser — inherent to the device-code
  flow currently in use; not addressed by this spec.
