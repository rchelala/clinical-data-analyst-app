# Manual Urgency Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pin a dashboard or report subscription to a fixed urgency level (High/Med/Low) that overrides the computed formula, persists until reset to Auto, and is reflected across the Brain (orbital radius, galaxy high-urgency count, solar-system urgency mix, detail panel).

**Architecture:** Approach A — compute urgency exactly as today, then *overlay* the manual override at the output. A nullable `manual_urgency` column on `dashboards` and `report_subscriptions` carries the pin. A single pure helper `resolveBucket(computed, manual)` (used on both server and client) guarantees identical behavior everywhere; a `MANUAL_RADIUS` map snaps pinned nodes' orbital distance.

**Tech Stack:** Next.js App Router (route handlers), Neon Postgres via `sql` tagged template, React client components, TypeScript. Spec: [docs/superpowers/specs/2026-07-07-manual-urgency-override-design.md](../specs/2026-07-07-manual-urgency-override-design.md).

**Testing note:** This repo has **no unit-test runner** (no vitest/jest — see `package.json`). The established convention is type-checking + manual verification. Each task's automated gate is `npx tsc --noEmit`. Do **not** run `npm run lint` — `next lint` mis-parses this repo's space-containing path and errors spuriously. End-to-end behavior is verified manually in Task 8.

**Branch:** Work happens on `feature/manual-urgency` (already created).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/urgency.ts` | modify | Add `resolveBucket` + `MANUAL_RADIUS` (the override rule) |
| `scripts/migrations/010_manual_urgency.sql` | create | Add `manual_urgency` column to both tables (Neon) |
| `scripts/schema.sql` | modify | Same column for fresh installs |
| `lib/brain-types.ts` | modify | `manualUrgency` on `Dashboard` + `ReportSubscription` |
| `lib/brain-mappers.ts` | modify | Map `manual_urgency` → `manualUrgency` |
| `lib/dashboard-queries.ts` | modify | SELECT `manual_urgency` (4 queries) |
| `app/api/dashboards/[id]/route.ts` | modify | Accept/validate/persist `manualUrgency` |
| `app/api/report-subscriptions/[id]/route.ts` | modify | Same |
| `app/api/dashboards/route.ts` | modify | Snap radius for pinned dashboards |
| `app/api/report-subscriptions/route.ts` | modify | Snap radius for pinned subscriptions |
| `app/api/brain/galaxy/route.ts` | modify | Resolve bucket before high-urgency tally |
| `components/brain/EditEntityForm.tsx` | modify | "Manual urgency" select |
| `components/brain/RequestSidePanel.tsx` | modify | Thread prop + "Manual" badge |
| `app/brain/page.tsx` | modify | Populate `manualUrgency` on side-panel entity |
| `components/brain/SolarSystemView.tsx` | modify | Overlay override in client bucketing |

---

## Task 1: Shared override helpers in `lib/urgency.ts`

**Files:**
- Modify: `lib/urgency.ts`

- [ ] **Step 1: Add `resolveBucket` and `MANUAL_RADIUS`**

Append to the end of `lib/urgency.ts` (after `bucketUrgencies`, before EOF):

```ts
/**
 * Overlays a manual urgency override onto a computed bucket. A non-null
 * `manual` value wins outright (the manual pin); `null` falls through to the
 * computed bucket. This is the single definition of the override rule, imported
 * by both server routes and client components so pins behave identically in
 * every view.
 */
export function resolveBucket(
  computed: UrgencyBucket,
  manual: UrgencyBucket | null
): UrgencyBucket {
  return manual ?? computed;
}

/**
 * Representative orbital radius for a pinned entity, by level. Pinned entities
 * snap to these fixed distances instead of participating in min-max
 * normalization: High is pulled toward the center, Low sits at the outer edge.
 */
export const MANUAL_RADIUS: Record<UrgencyBucket, number> = {
  high: MIN_RADIUS,
  med: (MIN_RADIUS + MAX_RADIUS) / 2,
  low: MAX_RADIUS,
};
```

`UrgencyBucket`, `MIN_RADIUS`, and `MAX_RADIUS` are already declared in this file.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/urgency.ts
git commit -m "feat(urgency): add resolveBucket + MANUAL_RADIUS override helpers"
```

---

## Task 2: Data layer — column, schema, types, mappers, queries

**Files:**
- Create: `scripts/migrations/010_manual_urgency.sql`
- Modify: `scripts/schema.sql`
- Modify: `lib/brain-types.ts`
- Modify: `lib/brain-mappers.ts`
- Modify: `lib/dashboard-queries.ts`

- [ ] **Step 1: Create the migration**

Create `scripts/migrations/010_manual_urgency.sql`:

```sql
-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds a nullable manual urgency override to dashboards and report subscriptions.
-- Values: 'high' | 'med' | 'low'; NULL = Auto (use the computed urgency formula).
-- Not enforced by a DB check constraint, matching the existing status/priority
-- convention (validated in the API layer instead).

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS manual_urgency text;
ALTER TABLE report_subscriptions ADD COLUMN IF NOT EXISTS manual_urgency text;
```

- [ ] **Step 2: Mirror the column in `scripts/schema.sql`**

In `scripts/schema.sql`, in `CREATE TABLE dashboards`, change the final column line:

```sql
   summary            text
);
```

to:

```sql
   summary            text,
   -- manual urgency override: 'high' | 'med' | 'low'; NULL = Auto (use computed formula)
   manual_urgency     text
);
```

Do the same in `CREATE TABLE report_subscriptions` — change:

```sql
   summary              text
);
```

to:

```sql
   summary              text,
   -- manual urgency override: 'high' | 'med' | 'low'; NULL = Auto (use computed formula)
   manual_urgency       text
);
```

- [ ] **Step 3: Add `manualUrgency` to the types**

In `lib/brain-types.ts`, in the `Dashboard` interface, add after `summary: string | null;`:

```ts
  manualUrgency: UrgencyBucket | null;
```

In the `ReportSubscription` interface, add after its `summary: string | null;`:

```ts
  manualUrgency: UrgencyBucket | null;
```

`UrgencyBucket` is already declared in this file (line ~10), above both interfaces.

- [ ] **Step 4: Map the column**

In `lib/brain-mappers.ts`, in `mapDashboardRow`, add after `summary: row.summary,`:

```ts
    manualUrgency: row.manual_urgency ?? null,
```

In `mapReportSubscriptionRow`, add after its `summary: row.summary,`:

```ts
    manualUrgency: row.manual_urgency ?? null,
```

- [ ] **Step 5: SELECT the column in all four queries**

In `lib/dashboard-queries.ts`, in **both** dashboard SELECT blocks (the `analystId` branch and the unscoped branch), add a line after `d.summary,`:

```sql
          d.manual_urgency,
```

In **both** subscription SELECT blocks, add a line after `s.summary,`:

```sql
          s.manual_urgency,
```

(Four insertions total — two dashboard queries, two subscription queries.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (TS now requires `manualUrgency` on every `Dashboard`/`ReportSubscription`; mappers supply it, so this passes. If a POST route's `RETURNING` doesn't include `manual_urgency`, the mapper's `?? null` still yields a valid value — no type error.)

- [ ] **Step 7: Commit**

```bash
git add scripts/migrations/010_manual_urgency.sql scripts/schema.sql lib/brain-types.ts lib/brain-mappers.ts lib/dashboard-queries.ts
git commit -m "feat(brain): add manual_urgency column, types, mapping, and queries"
```

- [ ] **Step 8: Apply the migration to Neon (manual, out-of-band)**

This cannot run from CI or this repo — run it against the live Neon database before the feature is exercised end-to-end (paste `scripts/migrations/010_manual_urgency.sql` into the Neon SQL editor, or use the Supabase/psql client). Idempotent via `ADD COLUMN IF NOT EXISTS`. Note this in the PR description as a required deploy step.

---

## Task 3: Write path — PATCH routes accept the override

**Files:**
- Modify: `app/api/dashboards/[id]/route.ts`
- Modify: `app/api/report-subscriptions/[id]/route.ts`

- [ ] **Step 1: Dashboards PATCH — imports and validation constant**

In `app/api/dashboards/[id]/route.ts`, change the brain-types import (line 4):

```ts
import { DashboardStatus } from '@/lib/brain-types';
```

to:

```ts
import { DashboardStatus, UrgencyBucket } from '@/lib/brain-types';
```

Add below the existing `VALID_STATUSES` constant (after line 6):

```ts
const VALID_URGENCY: UrgencyBucket[] = ['high', 'med', 'low'];
```

- [ ] **Step 2: Dashboards PATCH — accept, validate, merge, persist**

In the same file:

(a) In the `body` type object, add after `analystId?: number | null;`:

```ts
      manualUrgency?: UrgencyBucket | null;
```

(b) After the line `const { name, status, divisionId, analystId } = body;`, add:

```ts
    const manualUrgency = body.manualUrgency;
```

(c) In the "at least one field" guard, add a line before the closing `)`:

```ts
      manualUrgency === undefined &&
```

(d) After the `status` validation block (the `if (status !== undefined && !VALID_STATUSES...`), add:

```ts
    if (
      manualUrgency !== undefined &&
      manualUrgency !== null &&
      !VALID_URGENCY.includes(manualUrgency)
    ) {
      return NextResponse.json(
        { error: `manualUrgency must be one of: ${VALID_URGENCY.join(', ')}, or null` },
        { status: 400 }
      );
    }
```

(e) In the `current` SELECT, append `, manual_urgency` to the column list:

```ts
      SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
```

(f) In the `merged` object, add after `analystId: ...current[0].analyst_id,`:

```ts
      manualUrgency: manualUrgency !== undefined ? manualUrgency : current[0].manual_urgency,
```

(g) In the `UPDATE dashboards SET ...` statement, add `manual_urgency = ${merged.manualUrgency}` to the SET list (e.g. after `analyst_id = ${merged.analystId}`), and add `, manual_urgency` to the `RETURNING` column list.

- [ ] **Step 3: Subscriptions PATCH — same edits**

Apply the identical changes to `app/api/report-subscriptions/[id]/route.ts`:
- import `UrgencyBucket` alongside `DashboardStatus` (line 4).
- add the `VALID_URGENCY` constant after `VALID_STATUSES`.
- add `manualUrgency?: UrgencyBucket | null;` to the body type.
- add `const manualUrgency = body.manualUrgency;` after the existing destructure line (`const { name, status, divisionId, linkedDashboardId, analystId } = body;`).
- add `manualUrgency === undefined &&` to the "at least one field" guard.
- add the same `manualUrgency` validation block after the `status` validation.
- append `, manual_urgency` to the `current` SELECT column list.
- add `manualUrgency: manualUrgency !== undefined ? manualUrgency : current[0].manual_urgency,` to `merged`.
- add `manual_urgency = ${merged.manualUrgency}` to the `UPDATE report_subscriptions SET` list and `, manual_urgency` to `RETURNING`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboards/[id]/route.ts app/api/report-subscriptions/[id]/route.ts
git commit -m "feat(brain): persist manualUrgency via dashboard/subscription PATCH"
```

---

## Task 4: Read path (server) — radius snap + galaxy bucket resolve

**Files:**
- Modify: `app/api/dashboards/route.ts`
- Modify: `app/api/report-subscriptions/route.ts`
- Modify: `app/api/brain/galaxy/route.ts`

- [ ] **Step 1: Dashboards GET — snap pinned radius**

In `app/api/dashboards/route.ts`, change the import (line 5):

```ts
import { computeUrgency, normalizeRadius } from '@/lib/urgency';
```

to:

```ts
import { computeUrgency, normalizeRadius, MANUAL_RADIUS } from '@/lib/urgency';
```

and add `UrgencyBucket` to the brain-types import (line 6):

```ts
import { DashboardWithUrgency, UrgencyBucket } from '@/lib/brain-types';
```

In the `dashboards` map, change:

```ts
      urgency: urgencyScores[i],
      radius: radii[i],
```

to:

```ts
      urgency: urgencyScores[i],
      radius: row.manual_urgency
        ? MANUAL_RADIUS[row.manual_urgency as UrgencyBucket]
        : radii[i],
```

- [ ] **Step 2: Subscriptions GET — snap pinned radius**

In `app/api/report-subscriptions/route.ts`, apply the same import changes (add `MANUAL_RADIUS` to the urgency import; add `UrgencyBucket` to `import { ReportSubscriptionWithUrgency, UrgencyBucket } from '@/lib/brain-types';`), and in the `subscriptions` map change:

```ts
      urgency: urgencyScores[i],
      radius: radii[i],
```

to:

```ts
      urgency: urgencyScores[i],
      radius: row.manual_urgency
        ? MANUAL_RADIUS[row.manual_urgency as UrgencyBucket]
        : radii[i],
```

- [ ] **Step 3: Galaxy route — resolve bucket before the high tally**

In `app/api/brain/galaxy/route.ts`, change the urgency import (line 5):

```ts
import { computeUrgency, bucketUrgencies } from '@/lib/urgency';
```

to:

```ts
import { computeUrgency, bucketUrgencies, resolveBucket } from '@/lib/urgency';
```

and add `UrgencyBucket` to the brain-types import (line 6):

```ts
import { AnalystSummary, UrgencyBucket } from '@/lib/brain-types';
```

In the `combinedRows.forEach` block, change:

```ts
      if (buckets[i] === 'high') {
        highUrgencyCountByAnalyst.set(analystId, (highUrgencyCountByAnalyst.get(analystId) ?? 0) + 1);
      }
```

to:

```ts
      const resolvedBucket = resolveBucket(
        buckets[i],
        (row.manual_urgency ?? null) as UrgencyBucket | null
      );
      if (resolvedBucket === 'high') {
        highUrgencyCountByAnalyst.set(analystId, (highUrgencyCountByAnalyst.get(analystId) ?? 0) + 1);
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboards/route.ts app/api/report-subscriptions/route.ts app/api/brain/galaxy/route.ts
git commit -m "feat(brain): apply urgency override to radius and galaxy high-urgency count"
```

---

## Task 5: Edit UI — "Manual urgency" select

**Files:**
- Modify: `components/brain/EditEntityForm.tsx`
- Modify: `components/brain/RequestSidePanel.tsx`
- Modify: `app/brain/page.tsx`

- [ ] **Step 1: EditEntityForm — import, prop, state, options**

In `components/brain/EditEntityForm.tsx`:

(a) Change the brain-types import (line 5):

```ts
import { BrainEntityKind, DashboardStatus, Division, Analyst } from "@/lib/brain-types";
```

to:

```ts
import { BrainEntityKind, DashboardStatus, Division, Analyst, UrgencyBucket } from "@/lib/brain-types";
```

(b) In `EditEntityFormProps`, add after `initialStatus: DashboardStatus;`:

```ts
  initialManualUrgency: UrgencyBucket | null;
```

(c) In the destructured props (after `initialStatus,`), add:

```ts
  initialManualUrgency,
```

(d) Below the constants near the top of the file (after `STATUS_LABELS`), add:

```ts
const MANUAL_URGENCY_OPTIONS: { value: "" | UrgencyBucket; label: string }[] = [
  { value: "", label: "Auto (computed)" },
  { value: "high", label: "High" },
  { value: "med", label: "Med" },
  { value: "low", label: "Low" },
];
```

(e) Add state alongside the other `useState` calls (after the `status` state, line ~54). `""` represents Auto:

```ts
  const [manualUrgency, setManualUrgency] = useState<"" | UrgencyBucket>(
    initialManualUrgency ?? ""
  );
```

- [ ] **Step 2: EditEntityForm — include in the PATCH body**

In the `fields` object inside `handleSubmit`, add after the `analystId: ...` entry (keeping the same conversion-vs-edit guard pattern the file already uses — the value is only sent on a straight edit):

```ts
          // Only set on a straight edit; during a type conversion the /convert
          // endpoint doesn't handle urgency, and `undefined` is dropped by
          // JSON.stringify. `""` (Auto) becomes null to clear any override.
          manualUrgency:
            selectedKind === kind ? (manualUrgency === "" ? null : manualUrgency) : undefined,
```

Add `manualUrgency` to the `handleSubmit` `useCallback` dependency array (append to the existing list ending `..., onSaved]`):

```ts
    [kind, id, selectedKind, name, stakeholder, status, jiraTicketId, divisionId, linkedDashboardId, analystId, manualUrgency, onSaved]
```

- [ ] **Step 3: EditEntityForm — render the select**

Insert this block immediately after the Status `<div className="flex flex-col gap-1"> ... </div>` (the one containing `id="editEntityStatus"`), before the Division block:

```tsx
          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityUrgency" className="text-xs font-medium text-secondary">
              Manual urgency
            </label>
            <select
              id="editEntityUrgency"
              value={manualUrgency}
              onChange={(e) => setManualUrgency(e.target.value as "" | UrgencyBucket)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {MANUAL_URGENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-secondary">
              Auto uses the computed urgency formula. Pinning a level overrides it until set back to Auto.
            </p>
          </div>
```

- [ ] **Step 4: RequestSidePanel — carry `manualUrgency` and pass it through**

In `components/brain/RequestSidePanel.tsx`:

(a) Add `UrgencyBucket` to the brain-types import (line 5), e.g. `... RequestWithCreator, Tag, Task, UrgencyBucket } from "@/lib/brain-types";`.

(b) In `RequestSidePanelEntity`, add after `status: DashboardStatus;`:

```ts
  manualUrgency: UrgencyBucket | null;
```

(c) In the `<EditEntityForm ... />` JSX (near line 833), add after `initialStatus={entity.status}`:

```tsx
          initialManualUrgency={entity.manualUrgency}
```

- [ ] **Step 5: app/brain/page.tsx — populate `manualUrgency` on the entity**

In `app/brain/page.tsx`, in the `sidePanelEntity` memo, add `manualUrgency: dashboard.manualUrgency,` to the dashboard return object (after `status: dashboard.status,`) and `manualUrgency: subscription.manualUrgency,` to the subscription return object (after `status: subscription.status,`). No dependency-array change needed (`dashboards`/`subscriptions` are already deps).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If any other caller constructs a `RequestSidePanelEntity` or renders `EditEntityForm`, TS will flag the now-required fields — search and fix. As of this plan the only sites are `app/brain/page.tsx` and `components/brain/RequestSidePanel.tsx`.)

- [ ] **Step 7: Commit**

```bash
git add components/brain/EditEntityForm.tsx components/brain/RequestSidePanel.tsx app/brain/page.tsx
git commit -m "feat(brain): add Manual urgency select to the edit entity form"
```

---

## Task 6: Display — solar-system overlay + "Manual" badge

**Files:**
- Modify: `components/brain/SolarSystemView.tsx`
- Modify: `components/brain/RequestSidePanel.tsx`

- [ ] **Step 1: SolarSystemView — overlay override in client bucketing**

In `components/brain/SolarSystemView.tsx`:

(a) Change the urgency import (line 9):

```ts
import { bucketUrgencies } from "@/lib/urgency";
```

to:

```ts
import { bucketUrgencies, resolveBucket } from "@/lib/urgency";
```

Ensure `UrgencyBucket` is available from the brain-types import in this file; if not already imported, add it to the existing `@/lib/brain-types` import.

(b) Replace the `urgencyBucketsById` memo body (lines ~78-93) with:

```ts
  const urgencyBucketsById = useMemo(() => {
    const ids: {
      kind: "dashboard" | "subscription";
      id: number;
      divisionId: number;
      manualUrgency: UrgencyBucket | null;
    }[] = [];
    const scores: number[] = [];

    dashboards.forEach((d) => {
      ids.push({ kind: "dashboard", id: d.id, divisionId: d.divisionId, manualUrgency: d.manualUrgency });
      scores.push(d.urgency);
    });
    subscriptions.forEach((s) => {
      ids.push({ kind: "subscription", id: s.id, divisionId: s.divisionId, manualUrgency: s.manualUrgency });
      scores.push(s.urgency);
    });

    const buckets = bucketUrgencies(scores);
    return ids.map((entry, i) => ({
      ...entry,
      bucket: resolveBucket(buckets[i], entry.manualUrgency),
    }));
  }, [dashboards, subscriptions]);
```

This flows automatically into both the hover-panel "Urgency mix" tally (which filters `urgencyBucketsById` by `bucket`) and the moon coloring/fading (via `bucketByKey`), so pinned entities recolor and recount consistently.

- [ ] **Step 2: RequestSidePanel — "Manual" badge in the header**

In `components/brain/RequestSidePanel.tsx`, add this block immediately after the Stakeholder `<p>` (the `Stakeholder: {entity.stakeholder ?? "—"}` paragraph, ~line 488):

```tsx
            {entity.manualUrgency && (
              <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-purple-500/40 bg-purple-500/10 text-purple-400">
                Manual urgency ·{" "}
                {entity.manualUrgency === "high" ? "High" : entity.manualUrgency === "med" ? "Med" : "Low"}
              </span>
            )}
```

The badge appears only when a pin is set, keeping a manual override visible so it isn't forgotten. Resetting to Auto is done via the edit form (Task 5).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/brain/SolarSystemView.tsx components/brain/RequestSidePanel.tsx
git commit -m "feat(brain): reflect urgency override in solar-system mix and side-panel badge"
```

---

## Task 7: Build check

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npx next build`
Expected: build succeeds (compiles all routes/components). This catches any App Router / server-component issues `tsc` alone might miss.

- [ ] **Step 2: If the build fails**, fix the reported file and re-run until it passes. Do not commit a broken build.

---

## Task 8: Manual end-to-end verification

**Prerequisite:** Migration from Task 2 Step 8 has been applied to the database the dev server points at.

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` and open the Brain page.

- [ ] **Step 2: Pin a dashboard to High**

Open a dashboard's side panel → Edit → set **Manual urgency = High** → Save.
Expected: the side panel now shows a purple **"Manual urgency · High"** badge; the dashboard's node is pulled toward the center (smaller orbital radius).

- [ ] **Step 3: Persistence**

Reload the page and reopen the same dashboard.
Expected: still High, badge still present, still near center.

- [ ] **Step 4: Aggregate propagation**

- Solar-system view: hover the pinned dashboard's division → the **"Urgency mix"** panel counts it under `high`.
- Galaxy view: the pinned dashboard's owning analyst → **"High urgency"** count reflects the pin (incremented vs. before).

- [ ] **Step 5: Reset to Auto**

Edit the dashboard → set **Manual urgency = Auto (computed)** → Save.
Expected: badge disappears; node returns to its computed orbit; aggregate counts revert.

- [ ] **Step 6: Subscriptions**

Repeat Steps 2–5 for a report subscription. Expected: identical behavior.

- [ ] **Step 7: Final type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Self-review notes (author)

- **Spec coverage:** level override (Tasks 2/3/5), both entity kinds (Tasks 3/5/6 apply to dashboards + subscriptions), persist-until-Auto (Task 3 merge semantics + Task 5 Auto→null), Approach A overlay (Task 1 helpers, Task 4 radius/galaxy, Task 6 solar-system), edit control (Task 5), aggregate displays from the screenshots (Task 4 galaxy count, Task 6 urgency mix), DetailPanel/side-panel badge (Task 6), deferred node marker (not implemented, by design).
- **Naming consistency:** `manual_urgency` (DB/SQL), `manualUrgency` (TS/JSON), `resolveBucket`, `MANUAL_RADIUS`, `VALID_URGENCY` used identically across all tasks.
- **No placeholders:** every code step shows exact content.
- **Note on the badge location:** the spec said "DetailPanel"; in practice the per-entity detail with the Edit button is `RequestSidePanel` (the generic `DetailPanel` is the division hover card), so the badge lives there. Same intent, correct component.
