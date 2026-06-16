# ClinKit UI Redesign — Design Spec

**Date:** 2026-06-16  
**Status:** Approved

---

## Context

ClinKit is a multi-tool clinical data hub with five tabs. The current UI feels disorganized because global settings (AI provider) are jammed into the navigation row, the active tab indicator is barely visible, and there are no clear visual zones separating the app header from nav from tool controls. This redesign establishes clear zones, improves hierarchy, and adds tasteful animated accents without changing any functionality.

---

## What Changes

### 1. Visual Zone Structure

Four distinct horizontal zones, each with its own background and border:

| Zone | Background | Purpose |
|------|-----------|---------|
| App Header | `bg-secondary` (`#161b22`) | Branding + global settings |
| Navigation | `bg-primary` (`#0d1117`) | Tab switching |
| Tool Toolbar | `bg-secondary` (`#161b22`) | Per-tool controls (Commenter only) |
| Content | `bg-primary` | Monaco editor, forms |

Each zone separated by `border-b border-theme`.

### 2. App Header (replaces `Header.tsx` content)

**Left:** Logo icon (animated gradient) + "ClinKit" wordmark + subtitle "Clinical data toolkit"  
**Right:** AI provider dropdown + theme toggle button

The AI provider selector moves **out of the tab row** and into the header. It is a global setting and belongs at the top level.

**Logo icon animation:** The existing SVG icon (cross/plus shape with gold star accent) is kept unchanged. Only the **background container** (`w-9 h-9 rounded-lg`) gets the animated gradient, replacing the current static `linear-gradient(135deg, #1d4ed8, #7c3aed)`:

```css
@keyframes logo-pulse {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}
.logo-icon-bg {
  background: linear-gradient(135deg, #3a5fff, #7c3aed, #0ea5e9, #3a5fff);
  background-size: 300% 300%;
  animation: logo-pulse 5s ease infinite;
}
```

### 3. Navigation Tab Bar

**Tab order (left to right):**
1. Field Request — `TableProperties` icon
2. IT Reference — `FileText` icon
3. Clinician Guide — `Users` icon
4. PBIX Explorer — `FileBarChart2` icon
5. Commenter — `Code2` icon

**Active tab indicator:** 2px solid `#3a5fff` bottom border (`border-b-2 border-brand-500`), replaces the current `rounded-t-lg border-x border-t` approach which is hard to read.

**Inactive tabs:** icon + label, `text-secondary`, no border. Hover → `text-primary`.

### 4. Tool Toolbar (Commenter tab only)

Layout unchanged (`justify-between`), but clearly anchored by zone separation above and below.

**Left group** (what you're working on): `LanguageToggle` + `DensitySelector`  
**Right group** (actions): History, Reset, Summarize buttons + **Add Comments** CTA

**Add Comments button animation:**
```css
@keyframes btn-shimmer {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}
.btn-primary {
  background: linear-gradient(135deg, #3a5fff, #7c3aed, #3a5fff, #0ea5e9);
  background-size: 300% 300%;
  animation: btn-shimmer 4s ease infinite;
}
```

Other toolbar buttons (History, Reset, Summarize) keep their current `border border-theme` ghost style.

### 5. Background Radial Glow

A static radial glow positioned at the top of the page, radiating downward through the header and nav before fading out above the content panels.

**Implementation:** Two-div pattern placed as the first child of the root layout `div`:

```tsx
{/* fixed background — behind all content */}
<div className="fixed inset-0 -z-10 bg-[#0d1117]" />
<div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />
```

The header and nav zone backgrounds use semi-transparent values so the glow shows through:
- Header: `bg-secondary/75` (was opaque `bg-secondary`)
- Nav tab bar: `bg-primary/70` (was opaque `bg-primary`)
- Toolbar + content panels remain fully opaque for readability

### 6. No Glassmorphism / No Aurora

No `backdrop-filter`. No animated header background. The glow, logo animation, and CTA button shimmer are the three visual accents — no more needed.

---

## Files to Change

| File | Change |
|------|--------|
| `components/Header.tsx` | Add AI provider dropdown (with `Bot` icon) + theme toggle to right side; add animated logo icon; keep "Clinical data toolkit" subtitle |
| `app/page.tsx` | Remove AI provider selector from tab row; update tab order; update active tab indicator class; add gradient CSS for CTA button |
| `app/globals.css` | Add `@keyframes logo-pulse` and `@keyframes btn-shimmer` |

### Key existing utilities to reuse
- `lib/providers.ts` — `AIProvider`, `loadProvider`, `saveProvider`, `PROVIDER_LABELS` (already used in `page.tsx`, move usage to `Header.tsx`)
- All Lucide icons already imported in `page.tsx` — `TableProperties`, `FileText`, `Users`, `FileBarChart2`, `Code2`
- `Bot` icon already imported — use it beside the provider dropdown in the header

---

## What Does Not Change

- All tab content components (`FieldRequestForm`, `ITReferenceForm`, `ClinicianGuideForm`, `PbixExplorerTab`, Commenter panels)
- Monaco editor split-panel layout
- Density selector, language toggle, history panel behavior
- Dark/light theme system (`next-themes`, CSS variables)
- Brand color `#3a5fff`
- No new npm dependencies

---

## Verification

1. Run `npm run dev`, open `http://localhost:3000`
2. Confirm header shows: logo (animated gradient icon) + "ClinKit" + AI provider dropdown + theme toggle
3. Confirm tab order: Field Request | IT Reference | Clinician Guide | PBIX Explorer | Commenter
4. Switch tabs — confirm active tab shows blue underline, inactive tabs show icon + muted label
5. Switch to Commenter tab — confirm toolbar renders with Language/Density left, actions right
6. Confirm "Add Comments" button animates (blue → purple → cyan shimmer)
7. Confirm logo icon cycles through gradient colors
8. Verify dark/light mode toggle still works correctly
9. Confirm AI provider selection persists on page reload (localStorage)
