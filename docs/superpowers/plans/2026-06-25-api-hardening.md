# API Hardening: Rate Limiting + Error Sanitization + Blob Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No test framework exists in this repo.** Every "write a failing test" step in the standard template is replaced with "run `npx tsc --noEmit`" (the sole automated gate) plus an explicit manual verification recipe using the dev server / `curl`. Do not invent a test framework or test files — follow the steps exactly as written.

**Goal:** Implement the three fixes from `docs/superpowers/specs/2026-06-25-api-hardening-design.md`: rate-limit the four AI-calling routes against cost abuse, stop leaking raw exception messages to API clients, and make uploaded attachment blob paths unguessable. No authentication is being added — this is explicitly out of scope per the spec.

**Architecture:** Task 1 builds the rate-limiting primitive (a Postgres table + `lib/rate-limit.ts` + a small `lib/get-client-ip.ts` helper). Task 2 wires that primitive into the four AI routes (`comment`, `generate-sql`, `it-reference`, `clinician-guide`). Task 3 is a mechanical sweep across all 19 API route files that currently echo `err.message` to the client, replacing the fallback with a fixed generic message (special-cased Postgres-error branches are left untouched). Task 4 is a one-line change to randomize the blob upload path.

**Tech Stack:** Next.js 16 App Router, `@neondatabase/serverless` (`neon()` tagged-template SQL client, already used via `lib/db.ts`), TypeScript, `@vercel/blob`.

---

## Task 1: Rate-limit storage primitive

**Files:**
- Create: `scripts/migrations/006_api_rate_limits.sql`
- Create: `lib/rate-limit.ts`
- Create: `lib/get-client-ip.ts`

**Context:** Migrations in this repo are plain numbered `.sql` files run manually against the Neon instance (see `scripts/migrations/004_division_creator.sql` for the convention — a comment header plus the DDL, no migration runner/framework).

- [ ] **Step 1: Write the migration**

Create `scripts/migrations/006_api_rate_limits.sql`:

```sql
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
```

- [ ] **Step 2: Run the migration against your Neon database**

Run (psql, or paste into the Neon SQL console — whichever you normally use for these):
```bash
psql "$DATABASE_URL" -f scripts/migrations/006_api_rate_limits.sql
```
Expected: `CREATE TABLE` with no errors. If `api_rate_limits` already exists from a prior partial run, drop it first (`DROP TABLE api_rate_limits;`) before re-running.

- [ ] **Step 3: Write the client-IP helper**

Create `lib/get-client-ip.ts`:

```typescript
import { NextRequest } from "next/server";

// Vercel always sets x-forwarded-for in production. Locally it's usually
// absent, so every local request falls into one shared "unknown" bucket —
// fine for dev, since rate limiting only matters in production.
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",")[0].trim();
}
```

- [ ] **Step 4: Write the rate-limit check**

Create `lib/rate-limit.ts`:

```typescript
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
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/006_api_rate_limits.sql lib/rate-limit.ts lib/get-client-ip.ts
git commit -m "feat: add Postgres-backed rate limit primitive"
```

---

## Task 2: Apply rate limiting to the four AI-calling routes

**Files:**
- Modify: `app/api/comment/route.ts:9` (top of `POST`)
- Modify: `app/api/generate-sql/route.ts:59` (top of `POST`)
- Modify: `app/api/it-reference/route.ts:320` (top of `POST`)
- Modify: `app/api/clinician-guide/route.ts:224` (top of `POST`)

**Context:** All four routes call paid Anthropic/Gemini APIs. Each gets the same two-line import and the same rate-limit-check block as the very first statement inside `try { ... }`, before any other work (so an over-limit caller never reaches the AI call). The limit is shared per-IP across all four routes (one counter, not per-route), per the spec.

- [ ] **Step 1: `app/api/comment/route.ts`**

Add to the top imports (after the existing `import { AIProvider } from "@/lib/providers";`):

```typescript
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
```

Change:

```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
```

To:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const body = await req.json();
```

- [ ] **Step 2: `app/api/generate-sql/route.ts`**

Add to the top imports (after `import { AIProvider } from "@/lib/providers";`):

```typescript
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
```

Change:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { tableName, fields, provider = "claude" } = await req.json() as {
```

To:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const { tableName, fields, provider = "claude" } = await req.json() as {
```

- [ ] **Step 3: `app/api/it-reference/route.ts`**

Add to the top imports (after `import Anthropic from "@anthropic-ai/sdk";`):

```typescript
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
```

Change:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { sql } = await req.json() as { sql: string };
```

To:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const { sql } = await req.json() as { sql: string };
```

- [ ] **Step 4: `app/api/clinician-guide/route.ts`**

Add to the top imports (after `import Anthropic from "@anthropic-ai/sdk";`):

```typescript
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
```

Change:

```typescript
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
```

To:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the dev server (`npm run dev`), then hammer the comment endpoint past the limit:

```bash
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/comment \
    -H "Content-Type: application/json" \
    -d '{"code":"x = 1","language":"python","density":"standard"}'
done
```

Expected: the first 20 lines print `200` (or `500` if no `ANTHROPIC_API_KEY` is set locally — that's fine, it means the request passed the rate-limit check and reached the AI call), and the 21st line prints `429`.

- [ ] **Step 7: Commit**

```bash
git add app/api/comment/route.ts app/api/generate-sql/route.ts app/api/it-reference/route.ts app/api/clinician-guide/route.ts
git commit -m "feat: rate-limit AI-calling routes against cost abuse"
```

---

## Task 3: Stop leaking raw exception messages to clients

**Files:**
- Modify: `app/api/analysts/route.ts:9-12`
- Modify: `app/api/brain/galaxy/route.ts:87-90`
- Modify: `app/api/clinician-guide/route.ts:295-300`
- Modify: `app/api/generate-sql/route.ts:124-127`
- Modify: `app/api/tags/route.ts:14-17,43-46`
- Modify: `app/api/it-reference/route.ts:362-367`
- Modify: `app/api/comment/route.ts:68-71`
- Modify: `app/api/divisions/route.ts:9-12,32-41`
- Modify: `app/api/report-subscriptions/route.ts:34-37,67-76`
- Modify: `app/api/report-subscriptions/[id]/route.ts:95-98,128-131`
- Modify: `app/api/requests/search/route.ts:48-51`
- Modify: `app/api/requests/route.ts:103-106,180-198`
- Modify: `app/api/dashboards/route.ts:34-37,67-76`
- Modify: `app/api/requests/attachment/route.ts:33-36`
- Modify: `app/api/requests/attachment/download/route.ts:39-42`
- Modify: `app/api/dashboards/[id]/route.ts:95-98,127-130`
- Modify: `app/api/requests/[id]/route.ts:77-80,123-126`
- Modify: `app/api/requests/[id]/tags/route.ts:51-64,98-101`
- Modify: `app/api/requests/[id]/links/route.ts:64-77,109-112`

**Context:** Every catch block in this codebase follows one of two shapes: a plain `err instanceof Error ? err.message : '...'` fallback (most common), or that same fallback after an `if` branch that special-cases a Postgres error `code` (e.g. unique-violation `23505`, foreign-key-violation `23503`) into a specific, safe, user-facing message. Only the **fallback** message changes in this task — the special-cased branches (which already return safe, hand-written strings) are untouched. `console.error(...)` calls are untouched in every case; they're server-side only.

The replacement message is always exactly: `"Something went wrong processing your request. Please try again."` at `status: 500`.

- [ ] **Step 1: `app/api/analysts/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error('List analysts error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List analysts error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 2: `app/api/brain/galaxy/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error('Galaxy summary error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Galaxy summary error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 3: `app/api/clinician-guide/route.ts`**

Change:
```typescript
  } catch (err) {
    console.error("Clinician Guide error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate the Clinician Guide." },
      { status: 500 }
    );
```
To:
```typescript
  } catch (err) {
    console.error("Clinician Guide error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
```

- [ ] **Step 4: `app/api/generate-sql/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error("Generate SQL error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error("Generate SQL error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
```

- [ ] **Step 5: `app/api/tags/route.ts` (two catch blocks)**

Change (GET):
```typescript
  } catch (err: unknown) {
    console.error('List tags error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List tags error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (POST):
```typescript
  } catch (err: unknown) {
    console.error('Create tag error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create tag error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 6: `app/api/it-reference/route.ts`**

Change:
```typescript
  } catch (err) {
    console.error("IT Reference error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate IT Reference document." },
      { status: 500 }
    );
```
To:
```typescript
  } catch (err) {
    console.error("IT Reference error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
```

- [ ] **Step 7: `app/api/comment/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error("Comment API error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error("Comment API error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
```

- [ ] **Step 8: `app/api/divisions/route.ts` (two catch blocks)**

Change (GET):
```typescript
  } catch (err: unknown) {
    console.error('List divisions error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List divisions error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (POST — keep the `23505` special case, only the fallback changes):
```typescript
  } catch (err: unknown) {
    console.error('Create division error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'A division with this name already exists.' },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create division error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'A division with this name already exists.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 9: `app/api/report-subscriptions/route.ts` (two catch blocks)**

Change (GET):
```typescript
  } catch (err: unknown) {
    console.error('List report subscriptions error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List report subscriptions error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (POST — keep the `23503` special case):
```typescript
  } catch (err: unknown) {
    console.error('Create report subscription error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create report subscription error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 10: `app/api/report-subscriptions/[id]/route.ts` (two catch blocks)**

Change (PATCH):
```typescript
  } catch (err: unknown) {
    console.error('Update report subscription error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Update report subscription error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (DELETE):
```typescript
  } catch (err: unknown) {
    console.error('Delete report subscription error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Delete report subscription error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 11: `app/api/requests/search/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error('Search requests error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Search requests error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 12: `app/api/requests/route.ts` (two catch blocks)**

Change (GET):
```typescript
  } catch (err: unknown) {
    console.error('List requests error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List requests error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (POST — keep both the `23503` and `23514` special cases):
```typescript
  } catch (err: unknown) {
    console.error('Create request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Referenced dashboardId/subscriptionId does not exist' },
          { status: 400 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          { error: 'Provide exactly one of dashboardId or subscriptionId.' },
          { status: 400 }
        );
      }
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Referenced dashboardId/subscriptionId does not exist' },
          { status: 400 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          { error: 'Provide exactly one of dashboardId or subscriptionId.' },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 13: `app/api/dashboards/route.ts` (two catch blocks)**

Change (GET):
```typescript
  } catch (err: unknown) {
    console.error('List dashboards error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('List dashboards error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (POST — keep the `23503` special case):
```typescript
  } catch (err: unknown) {
    console.error('Create dashboard error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create dashboard error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 14: `app/api/requests/attachment/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error('Upload request attachment error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Upload request attachment error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 15: `app/api/requests/attachment/download/route.ts`**

Change:
```typescript
  } catch (err: unknown) {
    console.error('Download request attachment error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Download request attachment error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 16: `app/api/dashboards/[id]/route.ts` (two catch blocks)**

Change (PATCH):
```typescript
  } catch (err: unknown) {
    console.error('Update dashboard error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Update dashboard error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (DELETE):
```typescript
  } catch (err: unknown) {
    console.error('Delete dashboard error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Delete dashboard error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 17: `app/api/requests/[id]/route.ts` (two catch blocks)**

Change (PATCH):
```typescript
  } catch (err: unknown) {
    console.error('Update request error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Update request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (DELETE):
```typescript
  } catch (err: unknown) {
    console.error('Delete request error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Delete request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 18: `app/api/requests/[id]/tags/route.ts` (two catch blocks)**

Change (POST — keep the `23503` special case):
```typescript
  } catch (err: unknown) {
    console.error('Add tag to request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Request not found.' },
          { status: 400 }
        );
      }
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Add tag to request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Request not found.' },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (DELETE):
```typescript
  } catch (err: unknown) {
    console.error('Remove tag from request error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Remove tag from request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 19: `app/api/requests/[id]/links/route.ts` (two catch blocks)**

Change (POST — keep the `23503` special case):
```typescript
  } catch (err: unknown) {
    console.error('Create request link error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'One or both requests not found.' },
          { status: 400 }
        );
      }
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Create request link error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'One or both requests not found.' },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

Change (DELETE):
```typescript
  } catch (err: unknown) {
    console.error('Delete request link error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```
To:
```typescript
  } catch (err: unknown) {
    console.error('Delete request link error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 20: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This sweep only touches return statements and removes now-unused `message` locals — tsc will flag any spot where `message` is still referenced elsewhere in a file you missed.)

- [ ] **Step 21: Manual verification**

Start the dev server (`npm run dev`), then trigger a real error path and confirm the response body no longer contains a raw exception message:

```bash
curl -s -X POST http://localhost:3000/api/divisions -H "Content-Type: application/json" -d '{}'
```

Expected: `{"error":"name is required."}` (this is an intentional `400` validation message — unchanged). Then force a `500` by sending malformed JSON:

```bash
curl -s -X POST http://localhost:3000/api/divisions -H "Content-Type: application/json" -d 'not json'
```

Expected: `{"error":"Something went wrong processing your request. Please try again."}`, not a raw JSON-parse exception message.

- [ ] **Step 22: Commit**

```bash
git add app/api
git commit -m "fix: stop leaking raw exception messages to API clients"
```

---

## Task 4: Randomize attachment blob pathnames

**Files:**
- Modify: `app/api/requests/attachment/route.ts:25`

**Context:** Uploaded attachment paths are currently `request-attachments/${Date.now()}-${file.name}` — predictable enough that an attacker who knows roughly when a file was uploaded could guess nearby timestamps and retrieve someone else's attachment. Switching to a random UUID removes that pattern. The download route doesn't need changes — it already just resolves whatever pathname it's given.

- [ ] **Step 1: Replace the timestamp with a random UUID**

Change (`app/api/requests/attachment/route.ts:25`):
```typescript
    const blob = await put(`request-attachments/${Date.now()}-${file.name}`, file, {
      access: 'private',
    });
```
To:
```typescript
    const blob = await put(`request-attachments/${crypto.randomUUID()}-${file.name}`, file, {
      access: 'private',
    });
```

`crypto.randomUUID()` is available globally in the Next.js Node runtime — no new import needed.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start the dev server (`npm run dev`), upload an attachment through the UI (or `curl -F "file=@test.xlsx" http://localhost:3000/api/requests/attachment`), and inspect the returned `url` query param.

Expected: the `pathname` is `request-attachments/<uuid>-test.xlsx` — a UUID (e.g. `a1b2c3d4-...`), not a numeric timestamp.

- [ ] **Step 4: Commit**

```bash
git add app/api/requests/attachment/route.ts
git commit -m "fix: use random UUID for attachment blob pathnames instead of timestamp"
```
