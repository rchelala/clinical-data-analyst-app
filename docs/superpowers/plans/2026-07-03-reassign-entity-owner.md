# Reassign Dashboard / Subscription Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user reassign an existing dashboard or report subscription to a different analyst (or unassign it) from the galaxy's existing per-entity Edit modal.

**Architecture:** Extend the two `PATCH` endpoints to accept an optional `analystId` and write it to the existing nullable `analyst_id` FK column. Add an "Analyst (owner)" `<select>` to the shared `EditEntityForm` modal, populated from `GET /api/analysts`. Thread the current owner id through `RequestSidePanelEntity` so the modal pre-fills it.

**Tech Stack:** Next.js App Router (route handlers), Neon serverless Postgres (`sql` tagged template), React 19, TypeScript, Tailwind.

**Testing note:** This repo has no automated test framework (only `dev`/`build`/`start`/`lint` scripts). Following the established convention of prior plans in `docs/superpowers/plans/`, each task is verified with `npm run lint`, a TypeScript/build check, and explicit manual verification steps — not unit tests.

---

## File Structure

- **Modify** `app/api/dashboards/[id]/route.ts` — accept `analystId` in the dashboard `PATCH` handler.
- **Modify** `app/api/report-subscriptions/[id]/route.ts` — accept `analystId` in the subscription `PATCH` handler (mirror of the dashboard change).
- **Modify** `components/brain/EditEntityForm.tsx` — add the "Analyst (owner)" dropdown, fetch analysts, send `analystId`.
- **Modify** `components/brain/RequestSidePanel.tsx` — add `analystId` to `RequestSidePanelEntity` and pass `initialAnalystId` into `EditEntityForm`.
- **Modify** `app/brain/page.tsx` — populate `analystId` in the `sidePanelEntity` memo for both entity kinds.

---

## Task 1: Dashboard PATCH accepts `analystId`

**Files:**
- Modify: `app/api/dashboards/[id]/route.ts`

- [ ] **Step 1: Add `analystId` to the request body type**

In the `const body = await req.json() as { ... }` block, add `analystId` after `divisionId`:

```ts
      worklistStatus?: string | null;
      summary?: string | null;
      divisionId?: number;
      analystId?: number | null;
    };
```

- [ ] **Step 2: Destructure `analystId`**

Change the destructuring line from:

```ts
    const { name, status, divisionId } = body;
```

to:

```ts
    const { name, status, divisionId, analystId } = body;
```

(`analystId` needs no `normalizeNullableString` — it is a number or null, not a trimmable string.)

- [ ] **Step 3: Add `analystId` to the "at least one field" guard**

In the big `if (name === undefined && ...)` guard, add a new line before the closing `)`:

```ts
      summary === undefined &&
      divisionId === undefined &&
      analystId === undefined
    ) {
```

- [ ] **Step 4: Select the current `analyst_id` so the merge fallback works**

The current-row `SELECT` does not fetch `analyst_id`. Add it so an omitted `analystId` preserves the existing owner. Change:

```ts
    const current = await sql`
      SELECT id, name, division_id, stakeholder, status, jira_ticket_id, priority, enterprise_analyst, comments, notes, worklist_status, summary
      FROM dashboards
      WHERE id = ${dashboardId}
    `;
```

to:

```ts
    const current = await sql`
      SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, priority, enterprise_analyst, comments, notes, worklist_status, summary
      FROM dashboards
      WHERE id = ${dashboardId}
    `;
```

- [ ] **Step 5: Add `analystId` to the merge object**

In the `const merged = { ... }` object, add after the `divisionId` line:

```ts
      divisionId: divisionId !== undefined ? divisionId : current[0].division_id,
      analystId: analystId !== undefined ? analystId : current[0].analyst_id,
    };
```

- [ ] **Step 6: Write `analyst_id` in the UPDATE**

In the `UPDATE dashboards SET ...` statement, add `analyst_id` to the `SET` clause (append to the last line before `WHERE`):

```ts
      SET name = ${merged.name}, stakeholder = ${merged.stakeholder}, status = ${merged.status}, jira_ticket_id = ${merged.jiraTicketId},
          priority = ${merged.priority}, enterprise_analyst = ${merged.enterpriseAnalyst}, comments = ${merged.comments},
          notes = ${merged.notes}, worklist_status = ${merged.worklistStatus}, summary = ${merged.summary}, division_id = ${merged.divisionId},
          analyst_id = ${merged.analystId}
      WHERE id = ${dashboardId}
```

(The `RETURNING` clause already includes `analyst_id` — no change there.)

- [ ] **Step 7: Extend the FK-violation error message**

Change the `23503` handler message from:

```ts
        { error: 'Referenced divisionId does not exist.' },
```

to:

```ts
        { error: 'Referenced divisionId or analystId does not exist.' },
```

- [ ] **Step 8: Verify it compiles and lints**

Run: `npm run lint`
Expected: no new errors in `app/api/dashboards/[id]/route.ts`.

- [ ] **Step 9: Manual verification**

Start the dev server (`npm run dev`) if not already running, then in a terminal:

```bash
curl -i -X PATCH http://localhost:3000/api/dashboards/1 \
  -H "Content-Type: application/json" \
  -d '{"analystId": 2}'
```

Expected: `200` with JSON whose `analystId` is `2`. Then:

```bash
curl -i -X PATCH http://localhost:3000/api/dashboards/1 \
  -H "Content-Type: application/json" \
  -d '{"analystId": null}'
```

Expected: `200` with `analystId` `null`. Then a bad id:

```bash
curl -i -X PATCH http://localhost:3000/api/dashboards/1 \
  -H "Content-Type: application/json" \
  -d '{"analystId": 999999}'
```

Expected: `400` with `"Referenced divisionId or analystId does not exist."`
(Use dashboard/analyst ids that exist in your local DB; `1` and `2` are illustrative.)

- [ ] **Step 10: Commit**

```bash
git add "app/api/dashboards/[id]/route.ts"
git commit -m "feat(api): allow reassigning a dashboard's owning analyst via PATCH"
```

---

## Task 2: Report-subscription PATCH accepts `analystId`

**Files:**
- Modify: `app/api/report-subscriptions/[id]/route.ts`

This mirrors Task 1 exactly for the subscription handler.

- [ ] **Step 1: Add `analystId` to the request body type**

In the `const body = await req.json() as { ... }` block, add `analystId` after `linkedDashboardId`:

```ts
      divisionId?: number;
      linkedDashboardId?: number | null;
      analystId?: number | null;
    };
```

- [ ] **Step 2: Destructure `analystId`**

Change:

```ts
    const { name, status, divisionId, linkedDashboardId } = body;
```

to:

```ts
    const { name, status, divisionId, linkedDashboardId, analystId } = body;
```

- [ ] **Step 3: Add `analystId` to the "at least one field" guard**

In the `if (name === undefined && ...)` guard, add a new line before the closing `)`:

```ts
      divisionId === undefined &&
      linkedDashboardId === undefined &&
      analystId === undefined
    ) {
```

- [ ] **Step 4: Select the current `analyst_id`**

Change:

```ts
    const current = await sql`
      SELECT id, name, division_id, stakeholder, status, jira_ticket_id, linked_dashboard_id, priority, enterprise_analyst, comments, notes, worklist_status, summary
      FROM report_subscriptions
      WHERE id = ${subscriptionId}
    `;
```

to (add `analyst_id`):

```ts
    const current = await sql`
      SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, linked_dashboard_id, priority, enterprise_analyst, comments, notes, worklist_status, summary
      FROM report_subscriptions
      WHERE id = ${subscriptionId}
    `;
```

- [ ] **Step 5: Add `analystId` to the merge object**

In `const merged = { ... }`, add after the `linkedDashboardId` line:

```ts
      linkedDashboardId: linkedDashboardId !== undefined ? linkedDashboardId : current[0].linked_dashboard_id,
      analystId: analystId !== undefined ? analystId : current[0].analyst_id,
    };
```

- [ ] **Step 6: Write `analyst_id` in the UPDATE**

In the `UPDATE report_subscriptions SET ...` statement, extend the `SET` clause:

```ts
      SET name = ${merged.name}, stakeholder = ${merged.stakeholder}, status = ${merged.status}, jira_ticket_id = ${merged.jiraTicketId},
          priority = ${merged.priority}, enterprise_analyst = ${merged.enterpriseAnalyst}, comments = ${merged.comments},
          notes = ${merged.notes}, worklist_status = ${merged.worklistStatus}, summary = ${merged.summary},
          division_id = ${merged.divisionId}, linked_dashboard_id = ${merged.linkedDashboardId}, analyst_id = ${merged.analystId}
      WHERE id = ${subscriptionId}
```

(The `RETURNING` clause already includes `analyst_id` — no change.)

- [ ] **Step 7: Extend the FK-violation error message**

Change:

```ts
        { error: 'Referenced divisionId does not exist.' },
```

to:

```ts
        { error: 'Referenced divisionId or analystId does not exist.' },
```

- [ ] **Step 8: Verify it compiles and lints**

Run: `npm run lint`
Expected: no new errors in `app/api/report-subscriptions/[id]/route.ts`.

- [ ] **Step 9: Manual verification**

```bash
curl -i -X PATCH http://localhost:3000/api/report-subscriptions/1 \
  -H "Content-Type: application/json" \
  -d '{"analystId": 2}'
```

Expected: `200` with `analystId` `2`. (Use a subscription id and analyst id that exist locally.)

- [ ] **Step 10: Commit**

```bash
git add "app/api/report-subscriptions/[id]/route.ts"
git commit -m "feat(api): allow reassigning a subscription's owning analyst via PATCH"
```

---

## Task 3: Add the "Analyst (owner)" dropdown to `EditEntityForm`

**Files:**
- Modify: `components/brain/EditEntityForm.tsx`

- [ ] **Step 1: Import `useEffect` and the `Analyst` type**

Change the React import:

```ts
import { useState, useEffect, useCallback } from "react";
```

Change the brain-types import to add `Analyst`:

```ts
import { BrainEntityKind, DashboardStatus, Division, Analyst } from "@/lib/brain-types";
```

- [ ] **Step 2: Add `initialAnalystId` to the props interface**

In `interface EditEntityFormProps`, add after `initialDivisionId`:

```ts
  initialDivisionId: number;
  initialAnalystId: number | null;
  dashboardsInDivision: { id: number; name: string }[];
```

- [ ] **Step 3: Destructure the new prop**

In the `export function EditEntityForm({ ... })` parameter list, add `initialAnalystId` after `initialDivisionId`:

```ts
  initialDivisionId,
  initialAnalystId,
  dashboardsInDivision,
```

- [ ] **Step 4: Add analyst state and load the analyst list**

After the existing `const [linkedDashboardId, setLinkedDashboardId] = useState(...)` block, add:

```ts
  const [analystId, setAnalystId] = useState(
    initialAnalystId !== null ? String(initialAnalystId) : ""
  );
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  // Populate the owner dropdown. A failure here is non-fatal — the select
  // just shows "Unassigned" plus whatever the user leaves selected — so we
  // don't surface an error for it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analysts");
        const data = await res.json();
        if (!cancelled && res.ok) setAnalysts(data);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 5: Send `analystId` in the PATCH body (only on a real edit)**

In `handleSubmit`, extend the `fields` object. Change:

```ts
        const fields = {
          name: name.trim(),
          stakeholder: stakeholder.trim() ? stakeholder.trim() : null,
          status,
          jiraTicketId: jiraTicketId.trim() ? jiraTicketId.trim() : null,
          divisionId: Number(divisionId),
          linkedDashboardId: linkedDashboardId ? Number(linkedDashboardId) : null,
        };
```

to:

```ts
        const fields = {
          name: name.trim(),
          stakeholder: stakeholder.trim() ? stakeholder.trim() : null,
          status,
          jiraTicketId: jiraTicketId.trim() ? jiraTicketId.trim() : null,
          divisionId: Number(divisionId),
          linkedDashboardId: linkedDashboardId ? Number(linkedDashboardId) : null,
          // Only reassign the owner on a straight edit. During a type
          // conversion the request goes to the /convert endpoint, which does
          // not handle ownership; `undefined` is dropped by JSON.stringify.
          analystId:
            selectedKind === kind
              ? analystId === ""
                ? null
                : Number(analystId)
              : undefined,
        };
```

- [ ] **Step 6: Add `analystId` to the `handleSubmit` dependency array**

Change the `useCallback` dependency list at the end of `handleSubmit` from:

```ts
    [kind, id, selectedKind, name, stakeholder, status, jiraTicketId, divisionId, linkedDashboardId, onSaved]
```

to:

```ts
    [kind, id, selectedKind, name, stakeholder, status, jiraTicketId, divisionId, linkedDashboardId, analystId, onSaved]
```

- [ ] **Step 7: Render the "Analyst (owner)" select**

Insert this block immediately after the closing `</div>` of the Division field block (the one containing `id="editEntityDivision"`), before the `selectedKind === "subscription"` linked-dashboard block:

```tsx
          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityAnalyst" className="text-xs font-medium text-secondary">
              Analyst (owner)
            </label>
            <select
              id="editEntityAnalyst"
              value={analystId}
              onChange={(e) => setAnalystId(e.target.value)}
              disabled={selectedKind !== kind}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">— Unassigned —</option>
              {analysts.map((analyst) => (
                <option key={analyst.id} value={String(analyst.id)}>
                  {analyst.name}
                </option>
              ))}
            </select>
            {selectedKind !== kind && (
              <p className="text-xs text-secondary">
                Owner can&apos;t be changed during a type conversion — save the
                conversion first, then reopen to reassign.
              </p>
            )}
          </div>
```

- [ ] **Step 8: Verify it compiles and lints**

Run: `npm run lint`
Expected: no new errors in `components/brain/EditEntityForm.tsx`.

Note: this task adds a required prop (`initialAnalystId`) to `EditEntityForm`. TypeScript will now flag the one call site in `RequestSidePanel.tsx` as missing the prop — that is expected and is fixed in Task 4. A full `npm run build` will not pass until Task 4 is done; `npm run lint` on this file is the check here.

- [ ] **Step 9: Commit**

```bash
git add components/brain/EditEntityForm.tsx
git commit -m "feat(brain): add analyst owner dropdown to EditEntityForm"
```

---

## Task 4: Thread the current owner through the side panel

**Files:**
- Modify: `components/brain/RequestSidePanel.tsx`
- Modify: `app/brain/page.tsx`

- [ ] **Step 1: Add `analystId` to the `RequestSidePanelEntity` interface**

In `components/brain/RequestSidePanel.tsx`, change the interface:

```ts
export interface RequestSidePanelEntity {
  kind: BrainEntityKind;
  id: number;
  name: string;
  stakeholder: string | null;
  status: DashboardStatus;
  jiraTicketId: string | null;
  divisionId: number;
  analystId: number | null;
  linkedDashboard: { id: number; name: string } | null;
  linkedSubscriptions: { id: number; name: string }[];
}
```

- [ ] **Step 2: Pass `initialAnalystId` into `EditEntityForm`**

In the `<EditEntityForm ... />` JSX (around line 831), add the prop after `initialDivisionId`:

```tsx
          divisions={divisions}
          initialDivisionId={entity.divisionId}
          initialAnalystId={entity.analystId}
          dashboardsInDivision={dashboardsInDivision}
```

- [ ] **Step 3: Populate `analystId` in the `sidePanelEntity` memo (dashboard branch)**

In `app/brain/page.tsx`, in the `sidePanelEntity` memo's dashboard branch, add `analystId` to the returned object:

```ts
      return {
        kind: "dashboard",
        id: dashboard.id,
        name: dashboard.name,
        stakeholder: dashboard.stakeholder,
        status: dashboard.status,
        jiraTicketId: dashboard.jiraTicketId,
        divisionId: dashboard.divisionId,
        analystId: dashboard.analystId,
        linkedDashboard: null,
        linkedSubscriptions: allSubscriptions
          .filter((s) => s.linkedDashboardId === dashboard.id)
          .map((s) => ({ id: s.id, name: s.name })),
      };
```

- [ ] **Step 4: Populate `analystId` in the `sidePanelEntity` memo (subscription branch)**

In the same memo's subscription branch, add `analystId`:

```ts
    return {
      kind: "subscription",
      id: subscription.id,
      name: subscription.name,
      stakeholder: subscription.stakeholder,
      status: subscription.status,
      jiraTicketId: subscription.jiraTicketId,
      divisionId: subscription.divisionId,
      analystId: subscription.analystId,
      linkedDashboard: findLinkedDashboard(subscription.linkedDashboardId, allDashboards),
      linkedSubscriptions: [],
    };
```

- [ ] **Step 5: Verify the whole thing builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (the missing-prop error from Task 3 is now resolved).

- [ ] **Step 6: Manual end-to-end verification**

With `npm run dev` running and logged in as analyst A:

1. Open the galaxy, click a dashboard node A owns → side panel → Edit.
2. Confirm the "Analyst (owner)" dropdown shows A pre-selected.
3. Change it to analyst B, Save.
4. Confirm the dashboard disappears from A's galaxy.
5. Switch analyst to B (top-right selector) → confirm the dashboard now appears in B's galaxy.
6. Repeat steps 1–5 for a subscription.
7. Edit an entity, set owner to "— Unassigned —", Save → confirm it persists (reopen Edit shows Unassigned).
8. Start a type conversion in the Edit modal → confirm the owner dropdown is disabled with the explanatory note, and the conversion still succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/brain/RequestSidePanel.tsx app/brain/page.tsx
git commit -m "feat(brain): wire dashboard/subscription owner into the edit modal"
```

---

## Self-Review Notes

- **Spec coverage:** API changes (Tasks 1–2) cover spec §1; `EditEntityForm` dropdown (Task 3) covers §2; wiring (Task 4) covers §3. Testing section maps to the manual steps in Task 4 Step 6 plus per-endpoint curl checks.
- **Type consistency:** `analystId` is `number | null` on `RequestSidePanelEntity` and the `initialAnalystId` prop; stored as a `string` in form state (matching the existing `linkedDashboardId` pattern) and converted to `number | null` when sent. `Analyst` (`{ id, name }`) is imported from `@/lib/brain-types`.
- **No migration:** `dashboards.analyst_id` (nullable) and `report_subscriptions.analyst_id` FKs already exist.
