# Mobile-Responsive ClinKit — Design

**Date:** 2026-07-04
**Status:** Approved (design)

## Problem

ClinKit is built for desktop. Colleagues use it mostly on PC, which works well, but
the author also checks things on a phone and finds it hard to navigate. Goal: make the
app usable on a phone **without changing the desktop experience at all**.

## Hard constraint

**Desktop UX/UI must remain pixel-identical to today.** All mobile work lives behind a
`<md` (below 768px) breakpoint. Any visible change to the desktop (`md+`) rendering is a
regression, not an acceptable trade-off.

## Scope

Priority mobile surfaces (what the user actually checks on a phone):

1. **Worklist** — task/status checking
2. **Overview** — KPI dashboard
3. **Brain** — galaxy visualization

Lower priority (make usable, not polished):

4. **Commenter & AI tools** — Commenter, Field Request, IT Reference, Clinician Guide,
   PBIX Explorer

Foundational (shared by all): **navigation** and **global scroll behavior**.

## Overarching approach

**CSS-first responsive, one shared shell.** Use Tailwind's standard breakpoints with
`md` (768px) as the phone/desktop line. The same pages adapt — no separate mobile site,
no device detection. Desktop rendering is untouched; mobile styles only activate below
`md`. Where a layout cannot simply reflow (the Worklist table), render an alternate
mobile presentation at the breakpoint rather than forcing the desktop layout to bend.

**Rationale:** lowest risk to the desktop workflow, single codebase, and consistent with
how the app is already built (Tailwind utility classes). Tailwind config uses default
breakpoints (no custom overrides), so `md:` is available immediately.

## Design by area

### 1. Navigation — hamburger drawer (shared, foundational)

- Extract the current header + horizontal tab bar into a shared **AppShell** component so
  all four areas share one navigation implementation.
- **Desktop (`md+`):** identical to today — brand, horizontal tab bar, AI-provider
  dropdown. No visual change.
- **Mobile (`<md`):** header collapses to brand + ☰ button. Tapping ☰ opens a slide-in
  drawer listing primary destinations — **Home, Brain, Worklist, Overview** — plus the AI
  sub-tools (Commenter, Field Request, IT Reference, Clinician Guide, PBIX Explorer)
  grouped under Home. Drawer closes on selection or backdrop tap.
- The AI-provider dropdown moves into the drawer footer on mobile.

**Note on current structure:** `app/page.tsx` renders the tab bar inline and mixes local
tab state (`activeTab`) with `next/link` navigation to `/brain`, `/worklist`, `/overview`.
The AppShell extraction should preserve this exact behavior on desktop.

### 2. Global layout / scroll behavior (affects every page)

Pages currently use `h-screen overflow-hidden` with fixed bars. Fine on desktop, but it
clips/strands content on mobile. On mobile: fixed nav, vertically scrollable body, so no
content is trapped off-screen. Desktop keeps `overflow-hidden`.

### 3. Worklist — stacked cards

- **`md+`:** existing table, unchanged.
- **`<md`:** each task renders as a card — title, status/priority badge, owner, dates, and
  key fields stacked vertically. No horizontal scrolling.
- Filters / status dropdowns collapse into a compact filter row or a "Filters" sheet.
- The weekly-update drawer becomes a full-screen sheet on mobile.
- Reference: `app/worklist/page.tsx` (~1571 lines) plus `components/worklist/*`.

### 4. Overview — single-column stack

- KPI card grid → single column on mobile.
- Charts (delivery, division engagement) go full width; allow horizontal scroll only for a
  chart that genuinely needs it.
- Mechanical reflow, no structural change. Reference: `app/overview/page.tsx`,
  `components/overview/*`.

### 5. Brain — touch-enabled galaxy

The galaxy is **already tap-driven** discrete zoom (tap a planet to zoom in, tap empty
space to zoom out) — see `components/brain/GalaxyCanvas.tsx`. It is not a free pan/zoom
that needs rebuilding. Taps already work as clicks. Mobile work is therefore:

- Make galaxy / solar-system / planet layouts fit a narrow viewport (responsive sizing so
  planets don't overlap or shrink to un-tappable dots).
- Ensure tap targets meet a minimum touch size (~44px).
- **DetailPanel** (division/entity detail) becomes a bottom sheet on mobile instead of a
  side panel.
- Keep the starfield background and zoom-enter animations.
- References: `components/brain/GalaxyView.tsx`, `SolarSystemView.tsx`, `PlanetView.tsx`,
  `DetailPanel.tsx`, `GalaxyCanvas.tsx`.

### 6. Commenter & AI tools — stack, don't polish

Lower priority: make usable, not a showcase.

- Side-by-side Input/Output panels (`app/page.tsx`, ~line 300) stack vertically on mobile
  (input on top, output below).
- Toolbar wraps; History and Summary panels become sheets/drawers on mobile.
- No dedicated mobile polish beyond "not broken."

## Testing

Manual verification at **375px** (iPhone SE) and **768px** (tablet boundary) for each of
the four areas, plus a desktop pass confirming zero regression. Drive the real running app
to verify behavior, not just inspect CSS. Explicitly diff desktop rendering before/after
to honor the hard constraint.

## Out of scope

- Offline support, PWA / installable app
- Mobile-specific features (features that don't exist on desktop)
- Any redesign of desktop layouts
- The Commenter/AI tools getting bespoke mobile UX beyond stacking
