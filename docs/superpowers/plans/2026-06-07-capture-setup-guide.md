# Capture Tab Setup Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-row setup checklist to the Capture tab that shows prerequisite status and lets users open a PowerShell window with the Playwright install command pre-filled.

**Architecture:** Two new Next.js API routes handle status detection and terminal spawning server-side (Node has access to the filesystem and `child_process`; the browser does not). The `DashboardCaptureTab` component gains a setup card that fetches status on mount and wires the action buttons.

**Tech Stack:** Next.js App Router route handlers, Node `child_process.spawn`, Playwright `chromium.executablePath()`, React useState/useEffect, Tailwind CSS, Lucide icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/capture/status/route.ts` | Create | Check if Playwright Chromium executable is on disk |
| `app/api/capture/open-terminal/route.ts` | Create | Spawn a detached PowerShell window with command pre-filled |
| `components/DashboardCaptureTab.tsx` | Modify | Add setup checklist card above URL input |

---

## Task 1: `GET /api/capture/status` route

**Files:**
- Create: `app/api/capture/status/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// app/api/capture/status/route.ts
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET() {
  let chromiumInstalled = false;
  try {
    const execPath = chromium.executablePath();
    chromiumInstalled = existsSync(execPath);
  } catch {
    chromiumInstalled = false;
  }
  return NextResponse.json({ chromiumInstalled });
}
```

- [ ] **Step 2: Manually verify the route**

With `npm run dev` running, open a browser and navigate to:
```
http://localhost:3000/api/capture/status
```

Expected if Chromium is installed:
```json
{ "chromiumInstalled": true }
```

Expected if not installed:
```json
{ "chromiumInstalled": false }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/capture/status/route.ts
git commit -m "feat: add GET /api/capture/status route for chromium install check"
```

---

## Task 2: `POST /api/capture/open-terminal` route

**Files:**
- Create: `app/api/capture/open-terminal/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// app/api/capture/open-terminal/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST() {
  const projectRoot = process.cwd();
  // Set-Location moves to project dir; Insert pre-fills the prompt via PSReadLine
  const psCommand = `Set-Location '${projectRoot}'; [Microsoft.PowerShell.PSConsoleReadLine]::Insert('npx playwright install chromium')`;

  const child = spawn("powershell.exe", ["-NoExit", "-Command", psCommand], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manually verify the route**

With `npm run dev` running, open the browser DevTools console and run:
```javascript
await fetch('/api/capture/open-terminal', { method: 'POST' }).then(r => r.json())
```

Expected: a new PowerShell window opens, its working directory is the project folder, and `npx playwright install chromium` is pre-filled at the prompt (cursor is at the end of that text, ready for Enter).

Expected JSON response:
```json
{ "ok": true }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/capture/open-terminal/route.ts
git commit -m "feat: add POST /api/capture/open-terminal route — spawns PowerShell with install command pre-filled"
```

---

## Task 3: Setup checklist card in `DashboardCaptureTab`

**Files:**
- Modify: `components/DashboardCaptureTab.tsx`

- [ ] **Step 1: Add the `SetupStatus` type and state**

At the top of the component file, add the type after the existing `CaptureState` type:

```typescript
type SetupStatus = "checking" | "ready" | "needs-chromium";
```

Inside the `DashboardCaptureTab` function, add these state variables after the existing `useState` declarations:

```typescript
const [setupStatus, setSetupStatus] = useState<SetupStatus>("checking");
const [openingTerminal, setOpeningTerminal] = useState(false);
```

- [ ] **Step 2: Add the status-check fetch on mount**

Add this `useEffect` inside the component, after the state declarations. This requires adding `useEffect` to the React import at the top of the file.

Update the import line:
```typescript
import { useState, useEffect } from "react";
```

Add the effect:
```typescript
useEffect(() => {
  fetch("/api/capture/status")
    .then((r) => r.json() as Promise<{ chromiumInstalled: boolean }>)
    .then((data) => setSetupStatus(data.chromiumInstalled ? "ready" : "needs-chromium"))
    .catch(() => setSetupStatus("needs-chromium"));
}, []);
```

- [ ] **Step 3: Add the `handleOpenTerminal` function**

Add this function inside the component, alongside the existing handler functions:

```typescript
async function handleOpenTerminal() {
  setOpeningTerminal(true);
  try {
    await fetch("/api/capture/open-terminal", { method: "POST" });
  } finally {
    setOpeningTerminal(false);
  }
}

async function handleCheckAgain() {
  setSetupStatus("checking");
  try {
    const res = await fetch("/api/capture/status");
    const data = await res.json() as { chromiumInstalled: boolean };
    setSetupStatus(data.chromiumInstalled ? "ready" : "needs-chromium");
  } catch {
    setSetupStatus("needs-chromium");
  }
}
```

- [ ] **Step 4: Add the required Lucide icons**

Update the icon import at the top of the file to include `CheckCircle2` and `Terminal`:

```typescript
import { Camera, Loader2, Download, CheckSquare, Square, AlertCircle, CheckCircle2, Terminal } from "lucide-react";
```

- [ ] **Step 5: Add the setup card JSX**

Inside the returned JSX, add the setup card as the first child of the `<div className="max-w-2xl mx-auto w-full space-y-6">` container — above the `{/* URL input */}` block:

```tsx
{/* Setup checklist */}
{setupStatus === "ready" ? (
  <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
    <span className="text-sm text-green-700 dark:text-green-400 font-medium">Setup complete</span>
  </div>
) : (
  <div className="rounded-lg border border-theme bg-panel divide-y divide-theme">
    {/* Row 1: Playwright Chromium */}
    <div className="flex items-center gap-3 px-4 py-3">
      {setupStatus === "checking" ? (
        <Loader2 className="w-4 h-4 animate-spin text-secondary flex-shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full bg-amber-400 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary">
          {setupStatus === "checking" ? "Checking Playwright Chromium…" : "Playwright Chromium not installed"}
        </p>
        {setupStatus === "needs-chromium" && (
          <p className="text-xs text-secondary mt-0.5">Required for headless browser screenshots</p>
        )}
      </div>
      {setupStatus === "needs-chromium" && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCheckAgain}
            className="text-xs text-brand-600 hover:underline"
          >
            Check again
          </button>
          <button
            onClick={handleOpenTerminal}
            disabled={openingTerminal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {openingTerminal ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Opening…</>
            ) : (
              <><Terminal className="w-3 h-3" />Open PowerShell</>
            )}
          </button>
        </div>
      )}
    </div>

    {/* Row 2: Dev server */}
    <div className="flex items-center gap-3 px-4 py-3">
      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
      <p className="text-sm font-medium text-primary">Dev server running</p>
    </div>
  </div>
)}
```

- [ ] **Step 6: Manually verify the full UI**

1. Run `npm run dev` and open `http://localhost:3000`
2. Click the **Capture** tab
3. Confirm the setup card appears at the top with a spinner briefly, then resolves to either green (if Chromium installed) or amber (if not)
4. If amber: click **Open PowerShell** — a new PowerShell window should open with `npx playwright install chromium` pre-filled at the prompt
5. Run the command in that window; when it finishes, return to the browser and click **Check again** — the row should turn green
6. Once both rows are green, the card should collapse to a single "Setup complete" line
7. Confirm the URL input and rest of the capture workflow still function normally

- [ ] **Step 7: Commit**

```bash
git add components/DashboardCaptureTab.tsx
git commit -m "feat: add setup checklist card to Capture tab with PowerShell launcher"
```
