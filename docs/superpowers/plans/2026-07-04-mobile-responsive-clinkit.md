# Mobile-Responsive ClinKit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ClinKit usable on a phone (navigation, Worklist, Overview, Brain, and the Commenter tools) without changing the desktop experience at all.

**Architecture:** CSS-first responsive using Tailwind's default breakpoints, with `md` (768px) as the phone/desktop line. Desktop (`md+`) markup is preserved exactly; mobile styles activate only below `md`. A shared `MobileNav` (hamburger + slide-in drawer) is added `md:hidden` to each page, while existing desktop tab bars gain `hidden md:flex` so they render identically at `md+` and disappear below it. The one layout that cannot reflow (the Worklist table) gets a parallel mobile card list. The Brain galaxy is scaled to fit narrow viewports with a transform capped at scale 1 (so desktop is untouched).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 3.4, lucide-react. No test runner exists in this repo — verification is `npm run build` + `npm run lint` staying green, plus driving the running app at 375px / 768px / 1440px widths.

**Hard constraint (applies to every task):** Desktop (`md+`) rendering must stay pixel-identical. Every mobile change must be gated behind a `<md` breakpoint (`md:hidden`, `hidden md:flex`, `flex-col md:flex-row`, `md:` overrides, or a scale capped at 1). Before marking any task done, confirm the `md+` classes are unchanged from the original.

---

## Reference: current navigation shape

Each page renders its own header + horizontal nav row (there is no shared shell today):
- `app/page.tsx` — header (`components/Header.tsx`) + tab bar at ~line 180: 5 local `activeTab` sub-tabs (`APP_TABS`, line 20) followed by `<Link>`s to `/brain`, `/worklist`, `/overview`.
- `app/worklist/page.tsx` — nav `<Link>`s at ~lines 798–818.
- `app/overview/page.tsx` — nav `<Link>`s at ~lines 111–128.
- `app/brain/page.tsx` — nav `<Link>`s at ~lines 351–419, root `flex flex-col h-screen overflow-hidden` at line 345.

The four **primary destinations** are: Home (`/`), Brain (`/brain`), Worklist (`/worklist`), Overview (`/overview`).

---

## Task 1: Shared MobileNav (hamburger + drawer)

Create the mobile navigation used by every page. Pure presentational + local open state; no viewport detection needed (visibility is controlled by Tailwind `md:hidden`).

**Files:**
- Create: `components/MobileNav.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Home, BrainCircuit, ClipboardList, Building2, Bot } from "lucide-react";
import { AIProvider, PROVIDER_LABELS } from "@/lib/providers";

export interface MobileNavSubTab {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

interface MobileNavProps {
  /** Which primary destination is active, for highlighting. */
  active: "home" | "brain" | "worklist" | "overview";
  /** Home-only: the in-page AI sub-tabs. Omit on other pages. */
  subTabs?: readonly MobileNavSubTab[];
  activeSubTab?: string;
  onSubTabSelect?: (id: string) => void;
  /** Optional provider selector shown in the drawer footer. */
  provider?: AIProvider;
  onProviderChange?: (p: AIProvider) => void;
}

const PRIMARY = [
  { key: "home",     href: "/",         label: "Home",     Icon: Home },
  { key: "brain",    href: "/brain",    label: "Brain",    Icon: BrainCircuit },
  { key: "worklist", href: "/worklist", label: "Worklist", Icon: ClipboardList },
  { key: "overview", href: "/overview", label: "Overview", Icon: Building2 },
] as const;

export function MobileNav({
  active, subTabs, activeSubTab, onSubTabSelect, provider, onProviderChange,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-theme bg-panel text-primary"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          {/* drawer */}
          <nav className="relative w-72 max-w-[80vw] h-full bg-panel border-r border-theme flex flex-col p-4 gap-1 animate-fade-in overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-primary">ClinKit</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-secondary hover:text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {PRIMARY.map(({ key, href, label, Icon }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active === key
                    ? "bg-brand-600/20 text-primary"
                    : "text-secondary hover:text-primary hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}

            {subTabs && subTabs.length > 0 && (
              <>
                <div className="mt-3 mb-1 px-3 text-[10px] uppercase tracking-wide text-secondary font-semibold">
                  Tools
                </div>
                {subTabs.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onSubTabSelect?.(id); setOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      activeSubTab === id
                        ? "bg-brand-600/20 text-primary"
                        : "text-secondary hover:text-primary hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </>
            )}

            {provider && onProviderChange && (
              <div className="mt-auto pt-4 border-t border-theme flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                <select
                  aria-label="Select AI provider"
                  value={provider}
                  onChange={(e) => onProviderChange(e.target.value as AIProvider)}
                  className="flex-1 text-xs font-medium rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none"
                >
                  {(Object.entries(PROVIDER_LABELS) as [AIProvider, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors referencing `components/MobileNav.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/MobileNav.tsx
git commit -m "feat(mobile): shared MobileNav hamburger drawer"
```

---

## Task 2: Home page — mobile nav, vertical scroll, stacked Commenter panels

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Render MobileNav in the header**

In `components/Header.tsx` the header is a flex row. Rather than edit Header (shared minimal), add MobileNav inside `app/page.tsx`'s tab-bar row. Import at top of `app/page.tsx`:

```tsx
import { MobileNav } from "@/components/MobileNav";
```

- [ ] **Step 2: Hide the desktop tab bar below `md` and add MobileNav**

In `app/page.tsx`, the tab-bar container (currently `className="flex items-center gap-1 px-6 border-b border-theme bg-primary-glass flex-shrink-0"`, ~line 180) — change `flex` to `hidden md:flex` and add a mobile bar before it:

```tsx
{/* Mobile nav bar (below md) */}
<div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
  <MobileNav
    active="home"
    subTabs={APP_TABS.map(({ id, label, Icon }) => ({ id, label, Icon }))}
    activeSubTab={activeTab}
    onSubTabSelect={(id) => setActiveTab(id as AppTab)}
    provider={provider}
    onProviderChange={handleProviderChange}
  />
  <span className="text-sm font-medium text-primary capitalize">
    {APP_TABS.find((t) => t.id === activeTab)?.label ?? "Home"}
  </span>
</div>

{/* Tab bar (md and up) — unchanged desktop markup */}
<div className="hidden md:flex items-center gap-1 px-6 border-b border-theme bg-primary-glass flex-shrink-0">
  {/* ...existing APP_TABS.map + Link elements unchanged... */}
</div>
```

- [ ] **Step 3: Allow vertical scroll on mobile**

The root wrapper is `<div className="flex flex-col h-screen overflow-hidden">` (~line 173). Change to allow scrolling below `md` while keeping desktop identical:

```tsx
<div className="flex flex-col h-screen md:overflow-hidden overflow-y-auto">
```

At `md+` this is `overflow-hidden` (unchanged). Below `md` it becomes scrollable.

- [ ] **Step 4: Stack the Commenter Input/Output panels on mobile**

The split-panel container is `<div className="flex flex-1 overflow-hidden">` (~line 300). Change to:

```tsx
<div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">
```

And the Input panel wrapper `<div className="flex flex-col flex-1 border-r border-theme overflow-hidden">` (~line 302) — the `border-r` is wrong when stacked. Change to:

```tsx
<div className="flex flex-col flex-1 border-b md:border-b-0 md:border-r border-theme overflow-hidden min-h-[40vh] md:min-h-0">
```

Add `min-h-[40vh] md:min-h-0` to the Output panel wrapper (~line 322) too so each panel has usable height when stacked:

```tsx
<div className="flex flex-col flex-1 overflow-hidden min-h-[40vh] md:min-h-0">
```

At `md+` every one of these resolves to the original classes.

- [ ] **Step 5: Verify build + lint**

Run: `npm run build`
Expected: compiles successfully.
Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`.
- At **1440px**: header, tab bar, and side-by-side panels look exactly as before (desktop regression check).
- At **375px**: desktop tab bar is hidden; a ☰ button shows; tapping it opens the drawer with Home/Brain/Worklist/Overview + Tools; the Commenter shows Input stacked above Output; the page scrolls vertically.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat(mobile): home nav drawer, vertical scroll, stacked commenter panels"
```

---

## Task 3: Worklist — mobile nav + hide desktop tab bar

**Files:**
- Modify: `app/worklist/page.tsx`

- [ ] **Step 1: Import MobileNav**

```tsx
import { MobileNav } from "@/components/MobileNav";
```

- [ ] **Step 2: Add mobile bar + hide desktop nav row**

Find the nav container holding the `<Link>`s (~lines 798–818). Wrap/duplicate the same way as the home page: add `md:hidden` mobile bar with `<MobileNav active="worklist" />` before it, and prefix the existing desktop nav row's class with `hidden md:flex` (replace its leading `flex`). Keep all existing `md+` classes intact.

```tsx
<div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
  <MobileNav active="worklist" />
  <span className="text-sm font-medium text-primary">Worklist</span>
</div>
```

- [ ] **Step 3: Allow vertical scroll on mobile**

Find the worklist root wrapper (the top-level `flex flex-col h-screen overflow-hidden` in this file) and change `overflow-hidden` → `md:overflow-hidden overflow-y-auto` exactly as Task 2 Step 3.

- [ ] **Step 4: Verify build + lint + browser**

Run: `npm run build` then `npm run lint` — expected clean.
Browser: at 1440px the worklist is unchanged; at 375px the ☰ appears and navigation works. (Table cards come in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add app/worklist/page.tsx
git commit -m "feat(mobile): worklist nav drawer + mobile scroll"
```

---

## Task 4: Worklist — mobile card list (replaces table below md)

The worklist has two `<table>` blocks (dashboards ~line 948, second section ~line 1232), each mapping a sorted items array to rows with columns: **Priority, Dashboard/Subscription, Tasks, Status, Enterprise Analyst, Comments, Notes, Summary**, plus an expand toggle. On mobile, hide the table and render the same items as stacked cards.

**Files:**
- Create: `components/worklist/WorklistItemCard.tsx`
- Modify: `app/worklist/page.tsx`

- [ ] **Step 1: Create the card component**

The card mirrors the interactive controls already used in the table rows (`StatusPrioritySelect`, the tasks expand button). It receives the same `item` object and the same handlers the table uses. Match the prop types to the existing row's usage in `app/worklist/page.tsx` (`item.name`, `item.kind`, `item.id`, `item.priority`, `item.worklistStatus`, `item.ownerName`, `item.isCovering`, plus `patchItem`, `toggleExpand`, `expandedKey`, `taskCounts`). Read those exact signatures from the table body (~lines 964–1050) before writing, and reuse them verbatim.

```tsx
"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";

// NOTE: Import the item type from wherever the page defines it (e.g. lib/weekly-update
// or a local type in app/worklist/page.tsx). Use the SAME type the table rows use —
// do not invent a new shape.
interface WorklistItemCardProps {
  item: any; // replace `any` with the page's actual item type when wiring in
  isOpen: boolean;
  counts: string;
  prioritySuggestions: string[];
  statusSuggestions: string[];
  onPatch: (kind: string, id: string, patch: Record<string, unknown>) => void;
  onToggle: (kind: string, id: string) => void;
  children?: React.ReactNode; // expanded task detail, rendered when isOpen
}

export function WorklistItemCard({
  item, isOpen, counts, prioritySuggestions, statusSuggestions, onPatch, onToggle, children,
}: WorklistItemCardProps) {
  return (
    <div className="rounded-xl border border-theme bg-panel p-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-primary text-sm truncate">{item.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {item.kind === "subscription" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded-full px-2 py-0.5">
                Subscription
              </span>
            )}
            {item.isCovering && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                Covering{item.ownerName ? ` · ${item.ownerName}` : ""}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(item.kind, item.id)}
          className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary flex-shrink-0"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          {counts}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Priority
          <div className="mt-1">
            <StatusPrioritySelect
              kind="priority"
              value={item.priority}
              suggestions={prioritySuggestions}
              onChange={(value) => onPatch(item.kind, item.id, { priority: value })}
            />
          </div>
        </label>
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Status
          <div className="mt-1">
            <StatusPrioritySelect
              kind="status"
              value={item.worklistStatus}
              suggestions={statusSuggestions}
              onChange={(value) => onPatch(item.kind, item.id, { worklistStatus: value })}
            />
          </div>
        </label>
      </div>

      {isOpen && <div className="mt-3 border-t border-theme/60 pt-3">{children}</div>}
    </div>
  );
}
```

> If the table passes a differently-named status-suggestions prop (e.g. `statusSuggestions` vs `worklistStatusSuggestions`), rename to match the page. The rule: reuse the exact identifiers already in `app/worklist/page.tsx`.

- [ ] **Step 2: Render cards below `md`, hide the table**

For **each** of the two table sections in `app/worklist/page.tsx`:

1. Add `hidden md:table` to the `<table className="w-full border-collapse">` element so the table only shows at `md+`.
2. Immediately after the table, add a mobile-only card list that maps the SAME `sortedItems` array (use the exact array variable each section maps — the first section maps `sortedItems`; confirm the second section's variable and reuse it):

```tsx
<div className="md:hidden">
  {sortedItems.map((item) => {
    const key = itemKey(item.kind, item.id);
    const isOpen = expandedKey === key;
    const counts = taskCounts(item);
    return (
      <WorklistItemCard
        key={key}
        item={item}
        isOpen={isOpen}
        counts={counts}
        prioritySuggestions={prioritySuggestions}
        statusSuggestions={statusSuggestions}
        onPatch={patchItem}
        onToggle={toggleExpand}
      >
        {/* Reuse the same expanded detail JSX the table renders in its
            `bg-black/25` expansion row (~line 1052). Extract that JSX into a
            shared variable/function if it is large, and render it here and in
            the table row so both stay in sync. */}
      </WorklistItemCard>
    );
  })}
</div>
```

3. Import the card at the top: `import { WorklistItemCard } from "@/components/worklist/WorklistItemCard";`

- [ ] **Step 3: Verify build + lint**

Run: `npm run build` then `npm run lint` — expected clean. Fix any type mismatches by aligning card prop types to the page's real item type.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`.
- At **1440px**: both worklist tables render exactly as before (`hidden md:table` = `table`), no cards visible.
- At **375px**: tables are hidden; each item shows as a card with name, badges, tasks toggle, and Priority/Status selectors; expanding a card shows its detail; editing priority/status still calls the API.

- [ ] **Step 5: Commit**

```bash
git add components/worklist/WorklistItemCard.tsx app/worklist/page.tsx
git commit -m "feat(mobile): worklist stacked cards below md"
```

---

## Task 5: Overview — mobile nav + confirm responsive stacking

Overview already uses responsive grids (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` at ~line 160, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` at ~line 216), so most reflow is done. This task adds mobile nav and verifies stacking + chart overflow.

**Files:**
- Modify: `app/overview/page.tsx`

- [ ] **Step 1: Import MobileNav and add mobile bar**

```tsx
import { MobileNav } from "@/components/MobileNav";
```

Add a `md:hidden` mobile bar with `<MobileNav active="overview" />` before the existing desktop nav `<Link>` row (~lines 111–128), and prefix that desktop nav row's leading `flex` with `hidden md:flex`.

```tsx
<div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
  <MobileNav active="overview" />
  <span className="text-sm font-medium text-primary">Overview</span>
</div>
```

- [ ] **Step 2: Allow vertical scroll on mobile**

Change the overview root wrapper's `overflow-hidden` → `md:overflow-hidden overflow-y-auto` (same pattern as Task 2 Step 3). If the page already scrolls its main content region, verify nothing is clipped at 375px instead.

- [ ] **Step 3: Prevent chart overflow**

For each chart component (`components/overview/DeliveryChart.tsx`, `DivisionEngagementCard.tsx`), wrap any fixed-width chart body in a horizontal-scroll container so it never forces the page wider than the viewport:

```tsx
<div className="w-full overflow-x-auto">
  {/* existing chart element */}
</div>
```

Only add this where a chart has an intrinsic min width; leave fluid charts alone.

- [ ] **Step 4: Verify build + lint + browser**

Run: `npm run build` then `npm run lint` — expected clean.
Browser: at 1440px the overview is unchanged; at 375px KPIs stack to 2 columns, cards stack to 1 column, no horizontal page scroll, ☰ works.

- [ ] **Step 5: Commit**

```bash
git add app/overview/page.tsx components/overview/DeliveryChart.tsx components/overview/DivisionEngagementCard.tsx
git commit -m "feat(mobile): overview nav drawer + chart overflow guards"
```

---

## Task 6: Brain — mobile nav + scale galaxy to fit narrow viewports

The galaxy geometry is fixed-pixel (`GALAXY_RADIUS = 320` in `components/brain/GalaxyView.tsx`, container `w-full h-full max-w-[900px] max-h-[900px]` at line 61). On a 375px screen the ±320px layout overflows. Scale the whole visualization to fit, capping the scale at 1 so desktop never changes. The `DetailPanel` is already a small `max-w-xs` card (line 22) — only needs an overflow guard.

**Files:**
- Modify: `app/brain/page.tsx`
- Modify: `components/brain/GalaxyView.tsx` (and `SolarSystemView.tsx`, `PlanetView.tsx` if they use the same fixed geometry)

- [ ] **Step 1: Import MobileNav and add mobile bar to brain page**

```tsx
import { MobileNav } from "@/components/MobileNav";
```

Add `md:hidden` mobile bar with `<MobileNav active="brain" />` before the desktop nav `<Link>` row (~lines 351–419), and prefix that row's leading `flex` with `hidden md:flex`.

```tsx
<div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
  <MobileNav active="brain" />
  <span className="text-sm font-medium text-primary">Brain</span>
</div>
```

- [ ] **Step 2: Add a fit-to-container scale wrapper**

Create a small hook to measure a container and compute a scale factor that fits a fixed design size, capped at 1.

Create `hooks/useFitScale.ts`:

```tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Returns a ref to attach to a container and a uniform scale (≤ 1) that makes a
 * `designSize`-square coordinate system fit inside that container. Scale is 1
 * whenever the container is at least `designSize` in both axes — so desktop,
 * where the container is large, always renders at scale 1 (unchanged).
 */
export function useFitScale(designSize: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(1, width / designSize, height / designSize);
      setScale(s > 0 ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designSize]);

  return { ref, scale };
}
```

- [ ] **Step 3: Apply the scale in GalaxyView**

In `components/brain/GalaxyView.tsx`, wrap the fixed-geometry content so it scales to fit. The design size is the galaxy's full extent — `GALAXY_RADIUS * 2` plus star ring padding; use `760` (2×320 + margin) as `designSize`. Attach the ref to the outer `w-full h-full max-w-[900px] max-h-[900px]` element (line 61) and apply the transform to the inner content:

```tsx
import { useFitScale } from "@/hooks/useFitScale";
// ...
const { ref, scale } = useFitScale(760);
// outer container (line 61) gets ref + centering:
<div ref={ref} className="w-full h-full max-w-[900px] max-h-[900px] flex items-center justify-center">
  <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
    {/* existing galaxy content unchanged */}
  </div>
</div>
```

Because `scale` is capped at 1 and desktop containers exceed 760px, desktop renders identically. Apply the same wrapper to `SolarSystemView.tsx` and `PlanetView.tsx` only if they render fixed-pixel geometry that overflows at 375px (check each; if they already use `w-full`/relative sizing, leave them).

- [ ] **Step 4: Guard the DetailPanel width on mobile**

In `components/brain/DetailPanel.tsx` (line 22), the card is `absolute top-4 left-4 max-w-xs`. On a 375px screen `max-w-xs` (20rem/320px) plus `left-4` can overflow. Change to:

```tsx
<div className="absolute top-4 left-4 right-4 md:right-auto max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
```

At `md+` `md:right-auto` restores the original (width driven by `max-w-xs` only); below `md` `right-4` keeps it within the viewport.

- [ ] **Step 5: Allow vertical scroll / correct main layout on mobile**

The brain root is `flex flex-col h-screen overflow-hidden` (line 345) and `<main className="flex-1 overflow-hidden flex flex-row">` (line 446). Keep the galaxy area at full height (it scales now), but ensure the mobile nav bar doesn't get clipped. Leave `h-screen` as-is (the galaxy should fill the screen, not scroll). No change needed here unless the 375px check shows clipping — if it does, change the root `overflow-hidden` → `md:overflow-hidden overflow-y-auto`.

- [ ] **Step 6: Verify build + lint**

Run: `npm run build` then `npm run lint` — expected clean.

- [ ] **Step 7: Verify in browser**

Run: `npm run dev`, open `/brain`.
- At **1440px**: galaxy is identical to before (scale = 1), DetailPanel unchanged, desktop tab bar shows.
- At **375px**: the entire galaxy fits on screen (no clipping/overflow); tapping a planet/star zooms in; tapping empty space zooms out; the DetailPanel stays within the screen; ☰ works.

- [ ] **Step 8: Commit**

```bash
git add app/brain/page.tsx components/brain/GalaxyView.tsx components/brain/DetailPanel.tsx hooks/useFitScale.ts
git commit -m "feat(mobile): brain nav drawer + fit-to-screen galaxy scaling"
```

---

## Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Build + lint**

Run: `npm run build` — expected: success.
Run: `npm run lint` — expected: no new errors.

- [ ] **Step 2: Desktop regression check (the hard constraint)**

Run: `npm run dev`. At **1440px** width, visit `/`, `/worklist`, `/overview`, `/brain`. Confirm each looks pixel-identical to `master`/pre-change: same header, same horizontal tab bars, same tables, same galaxy, no ☰ button visible. If anything differs on desktop, fix before proceeding — desktop parity is non-negotiable.

- [ ] **Step 3: Mobile check at 375px**

At **375px** for each of the four pages confirm:
- ☰ opens a drawer with Home/Brain/Worklist/Overview; links navigate and the drawer closes.
- Home: Commenter Input stacks above Output; Tools appear in the drawer and switch tabs.
- Worklist: items render as cards; priority/status editing works; expand works.
- Overview: KPIs and cards stack; no horizontal page scroll.
- Brain: galaxy fits on screen; tap-to-zoom in/out works; DetailPanel stays on screen.

- [ ] **Step 4: Tablet boundary check at 768px**

At exactly **768px** confirm each page has flipped to the desktop layout (this is the `md` breakpoint — desktop styles should be active at 768 and up).

- [ ] **Step 5: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix(mobile): verification-pass adjustments"
```

---

## Self-review notes

- **Spec coverage:** Nav drawer (Tasks 1–3,5,6) ✓; global scroll (Tasks 2,3,5) ✓; Worklist cards (Task 4) ✓; Overview stack (Task 5) ✓; Brain touch galaxy (Task 6) ✓; Commenter stacking (Task 2) ✓; testing (Task 7) ✓; desktop-untouched constraint (header on every task + Task 7 Step 2) ✓.
- **No unit tests:** intentional — repo has no test runner; verification is build + lint + driven browser checks, which is the meaningful signal for responsive layout.
- **Type consistency:** `WorklistItemCard` (Task 4) deliberately defers its `item` type to the page's real type and instructs reusing exact identifiers (`patchItem`, `toggleExpand`, `expandedKey`, `taskCounts`, `prioritySuggestions`, `statusSuggestions`) rather than inventing names.
