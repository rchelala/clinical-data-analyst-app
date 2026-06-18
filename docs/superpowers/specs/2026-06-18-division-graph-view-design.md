# Division Drill-Down: Force-Directed Graph View

## Overview

Replace `DivisionDetailBrain`'s orbital wedge/moon layout with a force-directed
network graph, styled after Obsidian's link-graph view. Scope is the
drill-down view only — the top-level division picker (`DivisionBrain`) is
unchanged. Dashboards and subscriptions merge into one unified graph space,
distinguished by node color instead of being split into left/right halves.
Open requests become permanent graph nodes (no collapse cap), connected to
their parent dashboard/subscription.

## Component architecture

- New `components/brain/DivisionGraphBrain.tsx` replaces
  `DivisionDetailBrain.tsx`'s body, keeping the same props shape (`division`,
  `dashboards`, `subscriptions`, `onSelectEntity`, `onBack`,
  `onAddSubscription`) so `app/brain/page.tsx` requires no changes beyond the
  import/component swap.
- `react-force-graph-2d` renders to `<canvas>` and is not SSR-safe, so it's
  loaded via `next/dynamic` with `ssr: false` inside `DivisionGraphBrain`.
- New `lib/brain-graph.ts`: pure function
  `buildGraphData(division, dashboards, subscriptions, requests)` returning
  `{ nodes, links }` in `react-force-graph`'s expected shape. Keeps
  graph-shaping logic testable and decoupled from rendering.
- Requests aren't currently fetched at the division-detail level (today
  `RequestSidePanel` lazily fetches per-entity on click). Since requests must
  render as nodes immediately, `DivisionGraphBrain` fetches all open requests
  for the division's dashboards + subscriptions up front, reusing the
  existing `/api/requests?dashboardId=`/`subscriptionId=` endpoint via
  parallel calls (one per entity).
- `RequestSidePanel` gains an optional `focusRequestId` prop. Clicking a
  request node opens the panel scrolled/highlighted to that specific request;
  clicking the entity node opens it unfocused (full list, current behavior).

## Graph data model

**Nodes:**
- **Center node** — the viewing analyst (existing blue dot convention,
  unchanged).
- **Entity nodes** (dashboard/subscription) — fill color encodes type (green
  = dashboard, purple = subscription); ring/border color encodes status
  (green = active, amber = maintenance, slate = retired); size scaled by
  urgency, same formula as today's `radius` field. Label always visible.
- **Request nodes** — small gray dots, one per open request belonging to that
  entity. Label shown only on hover (tooltip), matching current pattern for
  high-cardinality items. No collapse cap — all open requests render as
  individual nodes regardless of count, relying on the force simulation to
  spread them out.

**Links:** center → each entity node; entity → each of its request nodes. No
cross-links between entities or between requests.

## Interactions

- Click entity node → `RequestSidePanel` opens unfocused (current behavior:
  full list of that entity's requests, status dropdowns, Attach Field
  Request button for dashboards).
- Click request node → same panel opens with `focusRequestId` set, scrolled
  and visually highlighted to that request.
- Hover entity node → existing tooltip-style info card (name, stakeholder,
  last touched, open count).
- Hover request node → small tooltip with the request title.
- Drag/zoom/pan come built in via `react-force-graph-2d`.

## Visual encoding summary

| Element | Encodes | Values |
|---|---|---|
| Node fill color | Entity type | green = dashboard, purple = subscription |
| Node border/ring color | Status | green = active, amber = maintenance, slate = retired |
| Node size | Urgency | same `radius` calculation as today |
| Request node | — | small gray dot, fixed size |
| Edge | Hierarchy | center→entity, entity→request only |

## Technical risks

- **React 19 / Next 16 compatibility**: `react-force-graph-2d`'s peer-dep
  range may lag the repo's current React 19 + Next 16. Verify compatibility
  at install time. If incompatible, fall back to raw `d3-force` (physics
  only) driving the existing hand-rolled SVG rendering used by
  `DivisionBrain`/`DivisionDetailBrain` today — more code to write, but no
  dependency risk.
- **Theming on canvas**: canvas rendering means node/text colors must be set
  via JS canvas draw calls, not Tailwind classes. Mirror the existing CSS
  variable values (e.g. `--brand-500`) at render time so dark/light theme
  continues to work.

## Out of scope

- Top-level division picker (`DivisionBrain.tsx`) — untouched.
- Cross-entity or cross-request edges (e.g. shared stakeholder) — not
  requested, not built.
- Any change to the request data model, status workflow, or attach-to-
  dashboard flow — purely a visual/layout change to the drill-down view.
