# ClinKit UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize ClinKit's UI into four clear visual zones, add a radial background glow, animated logo background, animated CTA button, and move the AI provider selector from the tab row into the header.

**Architecture:** Three files change — `globals.css` gets the keyframe animations and semi-transparent background helper classes, `Header.tsx` gains provider dropdown props and an animated logo background, and `page.tsx` gets the background glow divs, reordered tabs with updated active-state styling, the removed provider selector, and the animated Add Comments button. No new dependencies.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Lucide React, next-themes

---

## File Map

| File | Change |
|------|--------|
| `app/globals.css` | Add `@keyframes logo-pulse`, `@keyframes btn-shimmer`, `.btn-shimmer`, `.logo-pulse-bg`, `.bg-secondary-glass`, `.bg-primary-glass` |
| `components/Header.tsx` | Accept `provider` + `onProviderChange` props; animate logo container; add `Bot` icon + provider dropdown on right side |
| `app/page.tsx` | Add background glow divs; pass provider props to `Header`; remove provider selector from tab row; reorder tabs; update active-tab class; apply `btn-shimmer` to Add Comments button |

---

## Task 1: Add CSS keyframes and helper classes to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Open `app/globals.css` and append the following block at the end of the file**

```css
/* ── Animated accents ── */
@keyframes logo-pulse {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}

@keyframes btn-shimmer {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}

.logo-pulse-bg {
  background: linear-gradient(135deg, #3a5fff, #7c3aed, #0ea5e9, #3a5fff);
  background-size: 300% 300%;
  animation: logo-pulse 5s ease infinite;
}

.btn-shimmer {
  background: linear-gradient(135deg, #3a5fff, #7c3aed, #3a5fff, #0ea5e9);
  background-size: 300% 300%;
  animation: btn-shimmer 4s ease infinite;
}

/* Semi-transparent zone backgrounds — lets the fixed radial glow show through */
.bg-secondary-glass {
  background: rgba(22, 27, 34, 0.75);
}

.bg-primary-glass {
  background: rgba(13, 17, 23, 0.70);
}
```

- [ ] **Step 2: Verify the file saved with no syntax errors**

Open `app/globals.css` and confirm the block appears at the bottom with no unclosed braces.

- [ ] **Step 3: Commit**

```bash
rtk git add app/globals.css && rtk git commit -m "feat: add logo-pulse, btn-shimmer keyframes and glass bg helpers"
```

---

## Task 2: Update Header.tsx — animated logo, provider dropdown

**Files:**
- Modify: `components/Header.tsx`

The current `Header` takes no props. We need to add `provider` and `onProviderChange` so the AI provider selector can live here. The existing SVG icon is kept exactly as-is — only its container div changes from a static inline style to the `.logo-pulse-bg` CSS class.

- [ ] **Step 1: Replace the full contents of `components/Header.tsx` with the following**

```tsx
"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { AIProvider, PROVIDER_LABELS } from "@/lib/providers";

interface HeaderProps {
  provider: AIProvider;
  onProviderChange: (p: AIProvider) => void;
}

export function Header({ provider, onProviderChange }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="logo-pulse-bg flex items-center justify-center w-9 h-9 rounded-lg">
          <svg width="22" height="22" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="3" width="10" height="32" rx="4" fill="white" fillOpacity="0.92" />
            <rect x="3" y="14" width="32" height="10" rx="4" fill="white" fillOpacity="0.92" />
            <circle cx="30" cy="8" r="5" fill="#fbbf24" />
            <path d="M30 5.5 L30.6 7.4 L32.5 8 L30.6 8.6 L30 10.5 L29.4 8.6 L27.5 8 L29.4 7.4 Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-primary leading-none">
            ClinKit
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Your clinical data analyst toolkit
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* AI provider selector */}
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as AIProvider)}
            className={`text-xs font-medium rounded-md border px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors ${
              provider === "gemini"
                ? "border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-theme"
            }`}
          >
            {(Object.entries(PROVIDER_LABELS) as [AIProvider, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          aria-label="Toggle theme"
        >
          {mounted ? (
            theme === "dark" ? (
              <Sun className="w-4 h-4 text-secondary" />
            ) : (
              <Moon className="w-4 h-4 text-secondary" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Confirm TypeScript accepts the new props shape**

```bash
rtk tsc --noEmit
```

Expected: no errors referencing `Header.tsx`. (There will be errors in `page.tsx` until Task 3 — that is expected.)

- [ ] **Step 3: Commit**

```bash
rtk git add components/Header.tsx && rtk git commit -m "feat: add provider dropdown and animated logo to Header"
```

---

## Task 3: Update page.tsx — background glow, reordered tabs, remove provider selector, animated CTA

**Files:**
- Modify: `app/page.tsx`

This task has four sub-changes applied to one file. Apply them in order.

### 3a — Add background glow divs and pass provider props to Header

- [ ] **Step 1: Update the `<Header />` call to pass provider props, and add two background glow divs as the first children of the root div**

Find this block (around line 164):
```tsx
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      <Header />
```

Replace with:
```tsx
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      {/* Fixed radial glow — behind all content, starts at top of page */}
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />
      <Header provider={provider} onProviderChange={handleProviderChange} />
```

### 3b — Reorder tabs and update active-state classes

- [ ] **Step 2: Replace the entire tab bar `<div>` block (the `justify-between` div containing all five tab buttons and the provider selector) with the reordered version below**

Find this block starting around line 168:
```tsx
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-1 px-6 pt-3 border-b border-theme bg-secondary flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("commenter")}
            ...
          >
```
...ending with the closing `</div>` of the entire provider selector wrapper (around line 244).

Replace the entire block with:
```tsx
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 border-b border-theme bg-primary-glass flex-shrink-0">
        {(
          [
            { id: "field-request",    label: "Field Request",   Icon: TableProperties },
            { id: "it-reference",     label: "IT Reference",    Icon: FileText        },
            { id: "clinician-guide",  label: "Clinician Guide", Icon: Users           },
            { id: "pbix-explorer",    label: "PBIX Explorer",   Icon: Search          },
            { id: "commenter",        label: "Commenter",       Icon: Code2           },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? "border-brand-500 text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
```

### 3c — Apply btn-shimmer to the Add Comments button

- [ ] **Step 3: Find the Add Comments button (around line 305) and replace its `className`**

Find:
```tsx
              <button
                onClick={handleComment}
                disabled={!input.trim() || isWorking}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              >
```

Replace with:
```tsx
              <button
                onClick={handleComment}
                disabled={!input.trim() || isWorking}
                className="btn-shimmer flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
rtk tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add app/page.tsx && rtk git commit -m "feat: background glow, reordered tabs, animated CTA button"
```

---

## Task 4: Verify the full UI in the browser

- [ ] **Step 1: Start the dev server**

```bash
rtk npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Check the header**

Confirm:
- Logo icon background cycles through blue → purple → cyan (not a static gradient)
- "ClinKit" and "Your clinical data analyst toolkit" subtitle visible
- AI provider dropdown appears on the right side with the Bot icon
- Theme toggle button still present

- [ ] **Step 3: Check the background glow**

Confirm a subtle gray radial glow is visible at the top of the page, fading toward the bottom. Header and nav should feel slightly less opaque than the toolbar.

- [ ] **Step 4: Check tab order and active state**

Confirm tab order left-to-right: **Field Request | IT Reference | Clinician Guide | PBIX Explorer | Commenter**

Click each tab — confirm:
- Active tab: solid blue underline (`border-brand-500`), full-brightness text
- Inactive tabs: no underline, muted text, hover brightens text

- [ ] **Step 5: Check the Commenter toolbar**

Click the Commenter tab. Confirm:
- Add Comments button has an animated gradient (blue → purple → cyan shimmer)
- History, Reset, Summarize buttons keep their ghost border style (no animation)
- LanguageToggle and DensitySelector remain on the left

- [ ] **Step 6: Check AI provider persistence**

Change the AI provider to Gemini. Reload the page. Confirm it loads back as Gemini.

- [ ] **Step 7: Check dark/light mode**

Click the theme toggle. Confirm the UI switches correctly and the glow is still visible in both modes.

- [ ] **Step 8: Final commit**

```bash
rtk git add -A && rtk git commit -m "chore: verify UI redesign complete"
```
