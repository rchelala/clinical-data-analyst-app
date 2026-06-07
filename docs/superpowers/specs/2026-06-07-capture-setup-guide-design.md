# Capture Tab Setup Guide Design

**Date:** 2026-06-07
**Status:** Approved

## Overview

Add a visible setup checklist to the Capture tab so users know what prerequisites are needed and can act on them without leaving the browser. Includes a button that opens a PowerShell window with the install command pre-filled.

## Problem

The Capture tab currently shows a passive one-line hint about `npm run dev` and `npx playwright install chromium`. Users have no indication of whether these prerequisites are met, and no in-app way to act on them.

## Design

### UI — Setup checklist card

A two-row card sits between the tab bar and the URL input in `DashboardCaptureTab`. It is always visible while the prerequisites are not fully met, and collapses to a single "Setup complete" line once both rows are green.

**Row 1 — Playwright Chromium**
- Status: checked by `GET /api/capture/status` on component mount
- States:
  - Loading: grey spinner, "Checking…"
  - Not installed: amber dot, "Playwright Chromium not installed" + "Open PowerShell" button + "Check again" link
  - Installed: green checkmark, "Playwright Chromium ready"

**Row 2 — Dev server**
- Always green — if the page loaded, the server is running
- Label: "Dev server running"

**Collapsed state**
- Once both rows are green, the card collapses to a single line: green dot + "Setup complete"
- The URL input and rest of the tab become the focus

### API — `GET /api/capture/status`

- Calls `chromium.executablePath()` from the `playwright` package
- If the path exists on disk: `{ chromiumInstalled: true }`
- If it throws or the path is missing: `{ chromiumInstalled: false }`
- No browser is launched — path check only, fast response

### API — `POST /api/capture/open-terminal`

- Uses `child_process.spawn` to open a new PowerShell window
- Sets working directory to the project root
- Pre-fills `npx playwright install chromium` at the prompt using PSReadLine's `Insert` method so the user sees the command ready to run and presses Enter to execute
- Window stays open after the command completes (`-NoExit`) so output is visible
- Returns `{ ok: true }` immediately — does not wait for install to finish

**PowerShell invocation:**
```
powershell.exe -NoExit -Command "cd '<project-root>'; [Microsoft.PowerShell.PSConsoleReadLine]::Insert('npx playwright install chromium')"
```

If PSReadLine is unavailable (older PowerShell), fall back to displaying the command prominently with `Write-Host` and leaving the cursor at an empty prompt.

### Post-install flow

- After opening the terminal and running the install, the user clicks **"Check again"** in the UI
- This re-calls `GET /api/capture/status`
- If now installed, Row 1 turns green; if both rows are green, the card collapses

No auto-polling. The user triggers the re-check manually once they see the terminal finish.

## Files Changed

| File | Change |
|------|--------|
| `app/api/capture/status/route.ts` | New — chromium install check |
| `app/api/capture/open-terminal/route.ts` | New — spawn PowerShell with command pre-filled |
| `components/DashboardCaptureTab.tsx` | Add setup checklist card above URL input |

## Out of Scope

- Auto-polling for install completion
- Installing any dependency other than Playwright Chromium
- Supporting non-Windows terminals (macOS/Linux)
- Running `npm run dev` from the UI (server is already running if you see the page)
