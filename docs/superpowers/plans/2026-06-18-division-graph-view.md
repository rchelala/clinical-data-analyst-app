# Division Drill-Down Force-Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DivisionDetailBrain`'s orbital wedge/moon layout with a force-directed network graph (via `react-force-graph-2d`) so dashboards, subscriptions, and their open requests render together as one color-coded graph, instead of being split into separate halves with collapsing moon dots.

**Architecture:** A new pure function `lib/brain-graph.ts` shapes dashboards/subscriptions/requests into `{ nodes, links }`. A new client component `components/brain/DivisionGraphBrain.tsx` fetches each entity's open requests, builds the graph data, and renders it with `react-force-graph-2d` (dynamically imported, `ssr: false`). `RequestSidePanel` gains a `focusRequestId` prop to scroll/highlight a specific request when its node is clicked. `app/brain/page.tsx` swaps `DivisionDetailBrain` for `DivisionGraphBrain` and tracks which request (if any) was clicked. `DivisionDetailBrain.tsx` and the now-unused `computeRequestMoonPositions` helper are deleted.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, `react-force-graph-2d`, `next-themes`

**This plan executes inside the existing worktree** `.worktrees\dashboard-brain` (branch `feature/dashboard-brain`) — all file paths below are relative to that worktree root, not the main repo root. There is no automated test runner configured in this project (confirmed: no jest/vitest config, no test script in `package.json`). Verification steps use `npx tsc --noEmit` for type safety and manual checks against the dev server (`npm run dev`, visit `/brain`), matching the convention used in `docs/superpowers/plans/2026-06-16-clinkit-ui-redesign.md`.

---

## File Map

| File | Change |
|------|--------|
| `package.json` / `package-lock.json` | Add `react-force-graph-2d` dependency |
| `lib/brain-graph.ts` | New. Pure `buildGraphData()` function + `GraphNode`/`GraphLink`/`GraphData` types |
| `components/brain/DivisionGraphBrain.tsx` | New. Replaces `DivisionDetailBrain.tsx` as the division drill-down view |
| `components/brain/RequestSidePanel.tsx` | Add `focusRequestId` prop: scrolls to and highlights that request |
| `app/brain/page.tsx` | Swap `DivisionDetailBrain` import/usage for `DivisionGraphBrain`; add `selectedRequestId` state; extend `onSelectEntity` call site |
| `components/brain/DivisionDetailBrain.tsx` | Deleted |
| `lib/layout-math.ts` | Remove unused `computeRequestMoonPositions` (its only caller is the deleted file) |

---

## Task 1: Install react-force-graph-2d

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run (from the worktree root):
```bash
npm install react-force-graph-2d
```

Expected: install succeeds and `react-force-graph-2d` appears under `dependencies` in `package.json`.

- [ ] **Step 2: If npm reports a peer-dependency conflict with React 19**

`react-force-graph-2d`'s peer range may still say React 16/17/18. If `npm install` fails with `ERESOLVE`, retry with:
```bash
npm install react-force-graph-2d --legacy-peer-deps
```
This is safe here — the library only uses stable React APIs (refs, effects), nothing 19-specific is required for it to function.

- [ ] **Step 3: Verify the dev server still boots**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` with no startup errors. Stop it (Ctrl+C) once confirmed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-force-graph-2d dependency"
```

---

## Task 2: Build the graph data shaping function

**Files:**
- Create: `lib/brain-graph.ts`

This is the pure logic layer: given a division's dashboards, subscriptions, and a map of their open requests, produce the node/link arrays the graph component will render. Keeping it separate from the component makes it possible to reason about and verify in isolation, even without a test runner wired up.

- [ ] **Step 1: Create `lib/brain-graph.ts`**

```typescript
// Pure data-shaping for the Dashboard Brain division drill-down graph.
// No rendering/canvas/React here on purpose — DivisionGraphBrain.tsx owns
// presentation, this file only decides what nodes and links exist.

import {
  BrainEntityKind,
  DashboardStatus,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestWithCreator,
} from './brain-types';

export type GraphNodeKind = 'center' | BrainEntityKind | 'request';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  val: number; // drives rendered node radius
  color: string; // fill color
  ringColor?: string; // border color (status), entity nodes only
  // For 'dashboard' | 'subscription' nodes: entityKind === kind, entityId === own id.
  // For 'request' nodes: entityKind/entityId identify the PARENT entity, requestId identifies the request itself.
  entityKind?: BrainEntityKind;
  entityId?: number;
  requestId?: number;
  stakeholder?: string | null;
  lastTouchedDate?: string;
  openRequestCount?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const CENTER_NODE_ID = 'center';

const TYPE_COLORS: Record<BrainEntityKind, string> = {
  dashboard: '#22c55e', // green-500
  subscription: '#a855f7', // purple-500
};

const STATUS_RING_COLORS: Record<DashboardStatus, string> = {
  active: '#22c55e',
  maintenance: '#f59e0b',
  retired: '#64748b',
};

const REQUEST_NODE_COLOR = '#94a3b8'; // slate-400
const CENTER_NODE_COLOR = '#3b82f6';
const REQUEST_NODE_VAL = 2;

type EntityWithUrgency = DashboardWithUrgency | ReportSubscriptionWithUrgency;

function entityNodeId(kind: BrainEntityKind, id: number): string {
  return `${kind}-${id}`;
}

function requestNodeId(requestId: number): string {
  return `request-${requestId}`;
}

/**
 * Builds the full node/link graph for a division's detail view: a center
 * "you" node, one node per dashboard/subscription (colored by type, ringed
 * by status), and one node per open (non-"done") request, linked to its
 * parent entity. `requestsByEntity` is keyed by `${kind}-${id}` (see
 * `entityNodeId`), matching how DivisionGraphBrain fetches per-entity.
 */
export function buildGraphData(
  dashboards: DashboardWithUrgency[],
  subscriptions: ReportSubscriptionWithUrgency[],
  requestsByEntity: Map<string, RequestWithCreator[]>
): GraphData {
  const nodes: GraphNode[] = [
    {
      id: CENTER_NODE_ID,
      kind: 'center',
      label: 'You',
      val: 6,
      color: CENTER_NODE_COLOR,
    },
  ];
  const links: GraphLink[] = [];

  const addEntity = (kind: BrainEntityKind, entity: EntityWithUrgency) => {
    const nodeId = entityNodeId(kind, entity.id);

    nodes.push({
      id: nodeId,
      kind,
      label: entity.name,
      val: Math.max(4, Math.min(14, 2 + entity.openRequestCount)),
      color: TYPE_COLORS[kind],
      ringColor: STATUS_RING_COLORS[entity.status],
      entityKind: kind,
      entityId: entity.id,
      stakeholder: entity.stakeholder,
      lastTouchedDate: entity.lastTouchedDate,
      openRequestCount: entity.openRequestCount,
    });
    links.push({ source: CENTER_NODE_ID, target: nodeId });

    const requests = requestsByEntity.get(nodeId) ?? [];
    for (const request of requests) {
      if (request.status === 'done') continue; // only open/in_progress are "open"

      const reqNodeId = requestNodeId(request.id);
      nodes.push({
        id: reqNodeId,
        kind: 'request',
        label: request.title,
        val: REQUEST_NODE_VAL,
        color: REQUEST_NODE_COLOR,
        entityKind: kind,
        entityId: entity.id,
        requestId: request.id,
      });
      links.push({ source: nodeId, target: reqNodeId });
    }
  };

  dashboards.forEach((d) => addEntity('dashboard', d));
  subscriptions.forEach((s) => addEntity('subscription', s));

  return { nodes, links };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `brain-graph.ts`.

- [ ] **Step 3: Manually verify the shaping logic**

Sanity-check the function against representative data using `npx tsx` (no need to create or commit any extra files):

```bash
npx tsx -e "
import { buildGraphData } from './lib/brain-graph';
const dashboards = [{ id: 1, name: 'Revenue', divisionId: 1, analystId: 1, stakeholder: 'Jane', status: 'active', jiraTicketId: null, lastTouchedDate: '2026-06-01', createdDate: '2026-01-01', openRequestCount: 2, urgency: 10, radius: 100 }];
const subscriptions = [];
const requestsByEntity = new Map([['dashboard-1', [
  { id: 11, dashboardId: 1, subscriptionId: null, createdById: 1, title: 'Add filter', description: null, requestType: 'feature', status: 'open', jiraTicketId: null, createdDate: '2026-06-01', completedDate: null, createdByName: 'Jane' },
  { id: 12, dashboardId: 1, subscriptionId: null, createdById: 1, title: 'Fix totals', description: null, requestType: 'bug', status: 'done', jiraTicketId: null, createdDate: '2026-06-01', completedDate: '2026-06-05', createdByName: 'Jane' },
]]]);
const graph = buildGraphData(dashboards, subscriptions, requestsByEntity);
console.log(JSON.stringify(graph, null, 2));
"
```

Expected output: 3 nodes (`center`, `dashboard-1`, `request-11`) and 2 links (`center`→`dashboard-1`, `dashboard-1`→`request-11`). Request `12` (status `done`) must NOT appear — confirms the open-requests filter works.

- [ ] **Step 4: Commit**

```bash
git add lib/brain-graph.ts
git commit -m "feat(brain): add buildGraphData for division drill-down graph"
```

---

## Task 3: Render the graph skeleton in DivisionGraphBrain

**Files:**
- Create: `components/brain/DivisionGraphBrain.tsx`

This task gets a force graph on screen with entity nodes only (no requests yet, no custom painting) — confirming the library, dynamic import, and sizing work before layering on visuals.

- [ ] **Step 1: Create `components/brain/DivisionGraphBrain.tsx`**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { buildGraphData, GraphData } from "@/lib/brain-graph";
import {
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestWithCreator,
  BrainEntityKind,
} from "@/lib/brain-types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface DivisionGraphBrainProps {
  division: Division;
  dashboards: DashboardWithUrgency[]; // already filtered by caller to just this division
  subscriptions: ReportSubscriptionWithUrgency[]; // already filtered by caller to just this division
  onSelectEntity: (kind: BrainEntityKind, id: number, focusRequestId?: number) => void;
  onBack: () => void;
  onAddSubscription?: () => void;
}

const LIGHT_BG = "#f8fafc";
const DARK_BG = "#0d1117";

export function DivisionGraphBrain({
  division,
  dashboards,
  subscriptions,
  onSelectEntity,
  onBack,
  onAddSubscription,
}: DivisionGraphBrainProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [requestsByEntity, setRequestsByEntity] = useState<Map<string, RequestWithCreator[]>>(
    new Map()
  );
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // Track container size so the graph fills the available space and resizes
  // with the window/sidebar, instead of being hardcoded to a fixed box.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch each entity's requests up front so they can render as graph nodes
  // immediately, rather than lazily on click (today's RequestSidePanel
  // behavior). Re-runs whenever the division's entity lists change.
  useEffect(() => {
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError(null);

    const entities: { kind: BrainEntityKind; id: number }[] = [
      ...dashboards.map((d) => ({ kind: "dashboard" as const, id: d.id })),
      ...subscriptions.map((s) => ({ kind: "subscription" as const, id: s.id })),
    ];

    (async () => {
      try {
        const results = await Promise.all(
          entities.map(async ({ kind, id }) => {
            const param = kind === "dashboard" ? `dashboardId=${id}` : `subscriptionId=${id}`;
            const res = await fetch(`/api/requests?${param}`);
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error ?? "Could not load requests.");
            }
            return [`${kind}-${id}`, data as RequestWithCreator[]] as const;
          })
        );

        if (cancelled) return;
        setRequestsByEntity(new Map(results));
      } catch (err) {
        if (!cancelled) {
          setRequestsError(
            err instanceof Error ? err.message : "Network error — could not reach the server."
          );
        }
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboards, subscriptions]);

  const graphData: GraphData = useMemo(
    () => buildGraphData(dashboards, subscriptions, requestsByEntity),
    [dashboards, subscriptions, requestsByEntity]
  );

  const backgroundColor = resolvedTheme === "dark" ? DARK_BG : LIGHT_BG;

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          All divisions
        </button>
        <h2 className="text-sm font-semibold text-primary">{division.name}</h2>
        {requestsLoading && (
          <span className="text-xs text-secondary">Loading requests…</span>
        )}
        {requestsError && (
          <span className="text-xs text-red-600 dark:text-red-400">{requestsError}</span>
        )}
        {onAddSubscription && (
          <button
            onClick={onAddSubscription}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-auto"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Subscription
          </button>
        )}
      </div>

      <div ref={containerRef} className="relative flex-1">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={backgroundColor}
            nodeId="id"
            nodeVal="val"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `DivisionGraphBrain.tsx`. (`react-force-graph-2d`'s shipped types may be loose/`any`-heavy — that's fine for now, later tasks tighten usage at the call sites we add.)

- [ ] **Step 3: Manually verify in the browser**

Temporarily swap the import in `app/brain/page.tsx` is NOT needed yet — instead, verify in isolation by checking the dev server doesn't crash when this file is compiled:

Run: `npm run dev`
Expected: no compile errors in the terminal. (The component isn't wired into the page yet, so nothing visible changes — that happens in Task 7. This step just confirms the file itself is valid.)

- [ ] **Step 4: Commit**

```bash
git add components/brain/DivisionGraphBrain.tsx
git commit -m "feat(brain): add DivisionGraphBrain skeleton with sized force graph"
```

---

## Task 4: Custom node painting — colors, status rings, always-on entity labels

**Files:**
- Modify: `components/brain/DivisionGraphBrain.tsx`

- [ ] **Step 1: Add a `paintNode` callback and wire it to `nodeCanvasObject`**

In `components/brain/DivisionGraphBrain.tsx`, add the import and callback, and pass it to `ForceGraph2D`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

(replace the existing `useEffect, useMemo, useRef, useState` import line with the one above, adding `useCallback`)

Add this above the `return` statement:

```tsx
  const textColor = resolvedTheme === "dark" ? "#e6edf3" : "#0f172a";

  const paintNode = useCallback(
    (node: GraphData["nodes"][number] & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      ctx.beginPath();
      ctx.arc(x, y, node.val, 0, 2 * Math.PI, false);
      ctx.fillStyle = node.color;
      ctx.fill();

      if (node.ringColor) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = node.ringColor;
        ctx.stroke();
      }

      if (node.kind === "dashboard" || node.kind === "subscription") {
        ctx.font = `${12 / globalScale}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = textColor;
        ctx.fillText(node.label, x, y + node.val + 4);
      }
    },
    [textColor]
  );
```

Then update the `<ForceGraph2D ... />` element to add:

```tsx
            nodeCanvasObject={paintNode}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `DivisionGraphBrain.tsx`. If `react-force-graph-2d`'s `nodeCanvasObject` type doesn't accept this signature, widen the parameter type to `(node: any, ctx: CanvasRenderingContext2D, globalScale: number)` and cast inside the function body (`const n = node as GraphData["nodes"][number] & { x?: number; y?: number };`) rather than fighting the library's types.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`
Expected: no compile errors. (Still not wired into the page — full visual check happens in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add components/brain/DivisionGraphBrain.tsx
git commit -m "feat(brain): paint type-colored, status-ringed nodes with entity labels"
```

---

## Task 5: Click and hover behavior

**Files:**
- Modify: `components/brain/DivisionGraphBrain.tsx`

- [ ] **Step 1: Add hover state and an entity info-card overlay, matching the existing DivisionDetailBrain tooltip pattern**

Add this state near the top of the component (with the other `useState` calls):

```tsx
  const [hoveredNode, setHoveredNode] = useState<GraphData["nodes"][number] | null>(null);
```

Add these handlers above the `return` statement:

```tsx
  const handleNodeClick = useCallback(
    (node: GraphData["nodes"][number]) => {
      if (node.kind === "center" || !node.entityKind || node.entityId === undefined) return;
      onSelectEntity(node.entityKind, node.entityId, node.requestId);
    },
    [onSelectEntity]
  );

  const handleNodeHover = useCallback((node: GraphData["nodes"][number] | null) => {
    setHoveredNode(node && (node.kind === "dashboard" || node.kind === "subscription") ? node : null);
  }, []);

  function daysSince(dateString: string): number {
    return Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  }
```

- [ ] **Step 2: Wire the handlers and the request-hover native tooltip into `<ForceGraph2D>`**

Add these props to the existing `<ForceGraph2D ... />` element:

```tsx
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            nodeLabel={(node: GraphData["nodes"][number]) => (node.kind === "request" ? node.label : "")}
```

- [ ] **Step 3: Render the entity info-card overlay**

Add this just before the closing `</div>` of the `containerRef` div (i.e., as a sibling after the `<ForceGraph2D>` block):

```tsx
        {hoveredNode && (
          <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
            <p className="text-sm font-semibold text-primary">{hoveredNode.label}</p>
            <p className="text-xs text-secondary mt-1">
              Stakeholder: {hoveredNode.stakeholder ?? "—"}
            </p>
            {hoveredNode.lastTouchedDate && (
              <p className="text-xs text-secondary">
                Last touched: {daysSince(hoveredNode.lastTouchedDate)} days ago
              </p>
            )}
            <p className="text-xs text-secondary">
              Open requests: {hoveredNode.openRequestCount ?? 0}
            </p>
          </div>
        )}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `DivisionGraphBrain.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/brain/DivisionGraphBrain.tsx
git commit -m "feat(brain): wire node click/hover behavior in division graph"
```

---

## Task 6: focusRequestId support in RequestSidePanel

**Files:**
- Modify: `components/brain/RequestSidePanel.tsx`

When a request node is clicked directly in the graph, the side panel should open scrolled to and visually highlighting that specific request, instead of just showing the unfocused full list.

- [ ] **Step 1: Add the `focusRequestId` prop and a row-ref map**

In `components/brain/RequestSidePanel.tsx`, update the props interface:

```tsx
interface RequestSidePanelProps {
  entity: RequestSidePanelEntity | null;
  currentAnalystId: number;
  focusRequestId?: number;
  onClose: () => void;
}
```

Update the function signature:

```tsx
export function RequestSidePanel({ entity, currentAnalystId, focusRequestId, onClose }: RequestSidePanelProps) {
```

Add this near the other `useState`/`useCallback` declarations (needs `useRef` added to the existing React import):

```tsx
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
```

(Update the top-of-file import line to `import { useEffect, useState, useCallback, useRef } from "react";`)

- [ ] **Step 2: Scroll to the focused request once its row exists**

Add this effect after the existing requests-fetching `useEffect`:

```tsx
  useEffect(() => {
    if (!focusRequestId) return;
    const row = rowRefs.current[focusRequestId];
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequestId, requests]);
```

- [ ] **Step 3: Attach the ref and a highlight class to each request row**

Find the `requests.map((request) => (` block. Update the row's opening `<div>` from:

```tsx
                <div
                  key={request.id}
                  className="rounded-lg border border-theme px-4 py-3"
                >
```

to:

```tsx
                <div
                  key={request.id}
                  ref={(el) => {
                    rowRefs.current[request.id] = el;
                  }}
                  className={`rounded-lg border px-4 py-3 ${
                    request.id === focusRequestId
                      ? "border-brand-500 ring-2 ring-brand-500"
                      : "border-theme"
                  }`}
                >
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `RequestSidePanel.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/brain/RequestSidePanel.tsx
git commit -m "feat(brain): add focusRequestId to scroll/highlight a specific request"
```

---

## Task 7: Wire DivisionGraphBrain and focusRequestId into app/brain/page.tsx

**Files:**
- Modify: `app/brain/page.tsx`

- [ ] **Step 1: Swap the import**

In `app/brain/page.tsx`, change:

```tsx
import { DivisionDetailBrain } from "@/components/brain/DivisionDetailBrain";
```

to:

```tsx
import { DivisionGraphBrain } from "@/components/brain/DivisionGraphBrain";
```

- [ ] **Step 2: Track the focused request alongside the selected entity**

Find:

```tsx
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
```

Add right after it:

```tsx
  const [selectedRequestId, setSelectedRequestId] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Replace the `<DivisionDetailBrain>` usage**

Find:

```tsx
        {currentAnalystId !== null && !loading && !error && hasAnyEntities && selectedDivision && (
          <DivisionDetailBrain
            division={selectedDivision}
            dashboards={divisionDashboards}
            subscriptions={divisionSubscriptions}
            onSelectEntity={(kind, id) => setSelectedEntity({ kind, id })}
            onBack={() => setSelectedDivisionId(null)}
            onAddSubscription={() => setShowAddSubscriptionForm(true)}
          />
        )}
```

Replace with:

```tsx
        {currentAnalystId !== null && !loading && !error && hasAnyEntities && selectedDivision && (
          <DivisionGraphBrain
            division={selectedDivision}
            dashboards={divisionDashboards}
            subscriptions={divisionSubscriptions}
            onSelectEntity={(kind, id, focusRequestId) => {
              setSelectedEntity({ kind, id });
              setSelectedRequestId(focusRequestId);
            }}
            onBack={() => setSelectedDivisionId(null)}
            onAddSubscription={() => setShowAddSubscriptionForm(true)}
          />
        )}
```

- [ ] **Step 4: Pass `focusRequestId` to the side panel and clear it on close**

Find:

```tsx
      {currentAnalystId !== null && (
        <RequestSidePanel
          entity={sidePanelEntity}
          currentAnalystId={currentAnalystId}
          onClose={() => setSelectedEntity(null)}
        />
      )}
```

Replace with:

```tsx
      {currentAnalystId !== null && (
        <RequestSidePanel
          entity={sidePanelEntity}
          currentAnalystId={currentAnalystId}
          focusRequestId={selectedRequestId}
          onClose={() => {
            setSelectedEntity(null);
            setSelectedRequestId(undefined);
          }}
        />
      )}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (There will be an unused-import warning until Task 8 removes `DivisionDetailBrain.tsx` — that's fine, it's about to be deleted.)

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, then open `http://localhost:3000/brain`, select an analyst, and click into a division.

Expected:
- The division view renders as a force graph: a blue center node, green dashboard nodes and purple subscription nodes (with status-colored rings) all in one space, gray request-dot nodes branching off each entity.
- Dragging a node repositions it; the graph continues to settle/move (physics is live).
- Hovering a dashboard/subscription shows the info card (name, stakeholder, last touched, open count).
- Hovering a request node shows its title in a small tooltip.
- Clicking a dashboard/subscription node opens the side panel with its full request list.
- Clicking a request node opens the side panel scrolled to and highlighting that specific request.
- Toggling light/dark theme changes the graph background and label text color.

- [ ] **Step 7: Commit**

```bash
git add app/brain/page.tsx
git commit -m "feat(brain): wire DivisionGraphBrain into the brain page"
```

---

## Task 8: Remove the now-unused orbital detail view and moon-position helper

**Files:**
- Delete: `components/brain/DivisionDetailBrain.tsx`
- Modify: `lib/layout-math.ts`

- [ ] **Step 1: Confirm nothing else references the old component or helper**

Run:
```bash
grep -rln "DivisionDetailBrain\|computeRequestMoonPositions" --include="*.tsx" --include="*.ts" . --exclude-dir=node_modules
```
Expected output: only `components/brain/DivisionDetailBrain.tsx` and `lib/layout-math.ts` (the helper's definition site). If anything else shows up, stop and investigate before deleting.

- [ ] **Step 2: Delete the old component**

```bash
git rm components/brain/DivisionDetailBrain.tsx
```

- [ ] **Step 3: Remove `computeRequestMoonPositions` from `lib/layout-math.ts`**

Delete lines 97–132 of `lib/layout-math.ts` (the `/** Places up to ~8 request "moons"... */` comment block and the `computeRequestMoonPositions` function that follows it), leaving `computePositionInWedge`'s closing brace as the new end of that section. `Wedge`, `PolarPosition`, `computeDivisionWedges`, and `computePositionInWedge` all stay — they're still used by `DivisionBrain.tsx`.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. No references to the deleted symbols should remain.

- [ ] **Step 5: Manually re-verify the brain page**

Run: `npm run dev`, revisit `/brain`, click into a division again.
Expected: same behavior as Task 7 Step 6 — nothing regresses from the deletion.

- [ ] **Step 6: Commit**

```bash
git add lib/layout-math.ts
git commit -m "refactor(brain): remove orbital detail view, superseded by force graph"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Drill-down only (top-level division picker unchanged) | Task 7 (only `DivisionDetailBrain` usage swapped, `DivisionBrain` untouched) |
| Dashboards + subscriptions unified, colored by type | Task 2 (`TYPE_COLORS`), Task 4 (paint) |
| Status shown via ring color, not fill | Task 2 (`STATUS_RING_COLORS`), Task 4 (`ringColor` stroke) |
| Requests are always-visible nodes, no collapse cap | Task 2 (`buildGraphData` adds every non-done request) |
| Click entity → side panel, unfocused | Task 5 (`handleNodeClick`), Task 7 |
| Click request → side panel, focused/highlighted | Task 5 (`requestId` passthrough), Task 6, Task 7 |
| Entity labels always visible, request labels on hover only | Task 4 (canvas label), Task 5 (`nodeLabel` for requests only) |
| `react-force-graph-2d` via dynamic import, theme-aware | Task 3 (`dynamic(..., { ssr: false })`, `useTheme`) |
| Dead code removed | Task 8 |
