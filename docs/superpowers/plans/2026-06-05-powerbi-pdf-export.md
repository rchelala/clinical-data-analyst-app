# Power BI PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PDF export panel to the PBIX Explorer tab that automatically authenticates via Azure CLI and exports selected Power BI report pages as a real rendered PDF via the Power BI REST API.

**Architecture:** A `PbixExportPanel` component auto-fetches an access token on mount via a backend route that shells out to `az account get-access-token`. On export, a second backend route receives the PBIX file plus selected page internal names, runs the Power BI REST API sequence (upload → poll → export → poll → download → cleanup), and streams the PDF back to the browser.

**Tech Stack:** Next.js App Router API routes, Node.js `child_process.exec`, Power BI REST API (`api.powerbi.com/v1.0`), native `fetch`, React state machine pattern for UI phases.

> **No test framework is installed.** Each task verifies correctness via `npx tsc --noEmit` (type check) and manual smoke tests against the dev server.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/pbix-parser.ts` | Modify | Add `internalName` to `PbixPage`; add `rawFile` to browser-side state type |
| `lib/pbix-parser-browser.ts` | Modify | Populate `internalName` from `section.name` for each page |
| `app/api/powerbi-token/route.ts` | Create | Shell out to Azure CLI, return access token + expiry |
| `app/api/powerbi-export/route.ts` | Create | Orchestrate Power BI REST API upload→export→download→cleanup |
| `components/PbixExportPanel.tsx` | Create | Export UI: auto-connect, page selection, progress display |
| `components/PbixExplorerTab.tsx` | Modify | Track raw `File` objects alongside parsed data; render `PbixExportPanel` |

---

## Task 1: Add `internalName` to `PbixPage` and update both parsers

**Files:**
- Modify: `lib/pbix-parser.ts`
- Modify: `lib/pbix-parser-browser.ts`

### Context

The Power BI `ExportTo` API requires the **internal** page name (e.g., `"ReportSection1"`) not the display name (e.g., `"Sales Overview"`). In `Report/Layout`, each section has `section.name` (internal) and `section.displayName` (display). Currently the parsers collapse both into a single `name: string` using `displayName ?? name`.

### Steps

- [ ] **Step 1: Add `internalName` to `PbixPage` in `lib/pbix-parser.ts`**

Open `lib/pbix-parser.ts`. Change the `PbixPage` interface from:

```typescript
export interface PbixPage {
  name: string;
  visuals: PbixVisual[];
}
```

to:

```typescript
export interface PbixPage {
  name: string;         // display name shown in UI
  internalName: string; // internal ID used by Power BI REST API
  visuals: PbixVisual[];
}
```

- [ ] **Step 2: Update the server-side parser to populate `internalName`**

Still in `lib/pbix-parser.ts`, find the `pages` mapping (around line 94). Change:

```typescript
const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
  const pageName = section.displayName ?? section.name ?? "Unnamed Page";
  // ...
  return { name: pageName, visuals };
});
```

to:

```typescript
const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
  const pageName = section.displayName ?? section.name ?? "Unnamed Page";
  const internalName = section.name ?? pageName;
  // ...
  return { name: pageName, internalName, visuals };
});
```

- [ ] **Step 3: Update the browser parser to populate `internalName`**

Open `lib/pbix-parser-browser.ts`. Find the `pages` mapping (around line 178). Change:

```typescript
const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
  const pageName = section.displayName ?? section.name ?? "Unnamed Page";
  // ...
  return { name: pageName, visuals };
});
```

to:

```typescript
const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
  const pageName = section.displayName ?? section.name ?? "Unnamed Page";
  const internalName = section.name ?? pageName;
  // ...
  return { name: pageName, internalName, visuals };
});
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If TypeScript reports errors, they will be about callers of `PbixPage` that destructure `name` without `internalName` — no callers currently use `internalName` so there should be none.

- [ ] **Step 5: Commit**

```bash
git add lib/pbix-parser.ts lib/pbix-parser-browser.ts
git commit -m "feat: add internalName to PbixPage for Power BI export API"
```

---

## Task 2: Track raw `File` objects in `PbixExplorerTab`

**Files:**
- Modify: `components/PbixExplorerTab.tsx`

### Context

The Power BI export API requires uploading the actual PBIX bytes. Currently `PbixExplorerTab` discards the raw `File` object after parsing — only the parsed `PbixDashboard` is kept. We need to keep the raw `File` alongside the parsed result so the export panel can access it. We do this with a local extended type rather than polluting the shared `LoadedFile` interface (which is also used server-side where `File` doesn't exist).

### Steps

- [ ] **Step 1: Add a `LoadedFileWithRaw` type inside `PbixExplorerTab.tsx`**

At the top of `components/PbixExplorerTab.tsx`, after the imports, add:

```typescript
interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}
```

- [ ] **Step 2: Change the state type from `LoadedFile[]` to `LoadedFileWithRaw[]`**

Find:
```typescript
const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
```

Change to:
```typescript
const [loadedFiles, setLoadedFiles] = useState<LoadedFileWithRaw[]>([]);
```

- [ ] **Step 3: Store the raw `File` when processing files**

In `processFiles`, find:
```typescript
const dashboard = await parsePbixFileClient(file);
newFiles.push({ dashboard, fileName: file.name });
```

Change to:
```typescript
const dashboard = await parsePbixFileClient(file);
newFiles.push({ dashboard, fileName: file.name, rawFile: file });
```

- [ ] **Step 4: Fix the `newFiles` type annotation**

In `processFiles`, find:
```typescript
const newFiles: LoadedFile[] = [];
```

Change to:
```typescript
const newFiles: LoadedFileWithRaw[] = [];
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. The `PbixMeasuresView` receives `loadedFiles` as `LoadedFile[]` — since `LoadedFileWithRaw extends LoadedFile`, the assignment is valid.

- [ ] **Step 6: Commit**

```bash
git add components/PbixExplorerTab.tsx
git commit -m "feat: retain raw File in PbixExplorerTab for PDF upload"
```

---

## Task 3: Create `/api/powerbi-token` route

**Files:**
- Create: `app/api/powerbi-token/route.ts`

### Context

This route runs `az account get-access-token --resource https://analysis.windows.net/powerbi/api` on the local machine and returns the parsed token. It has no auth itself — it's a localhost-only tool. Error handling covers the two most common failures: Azure CLI not installed (ENOENT) and user not logged in (non-zero exit).

### Steps

- [ ] **Step 1: Create the file with the GET handler**

Create `app/api/powerbi-token/route.ts` with this full content:

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execAsync = promisify(exec);

interface AzTokenOutput {
  accessToken: string;
  expiresOn: string;
  tokenType: string;
}

export async function GET() {
  try {
    const { stdout } = await execAsync(
      "az account get-access-token --resource https://analysis.windows.net/powerbi/api --output json",
      { timeout: 15000 }
    );

    const parsed: AzTokenOutput = JSON.parse(stdout.trim());

    return NextResponse.json({
      accessToken: parsed.accessToken,
      expiresOn: parsed.expiresOn,
    });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string; code?: number };

    if (error.code === "ENOENT" || (error.message ?? "").includes("az: not found") || (error.message ?? "").includes("az.cmd")) {
      return NextResponse.json({ error: "azure_cli_not_found" }, { status: 503 });
    }

    const stderr = error.stderr ?? "";
    if (stderr.includes("az login") || stderr.includes("not logged in") || stderr.includes("Please run")) {
      return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    }

    return NextResponse.json({ error: "unknown", detail: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual smoke test (requires Azure CLI + az login)**

Start the dev server:
```bash
npm run dev
```

In a separate terminal:
```bash
curl http://localhost:3000/api/powerbi-token
```

Expected when logged in:
```json
{ "accessToken": "eyJ0...", "expiresOn": "2026-06-05 15:00:00.000000" }
```

Expected when not logged in:
```json
{ "error": "not_logged_in" }
```

- [ ] **Step 4: Commit**

```bash
git add app/api/powerbi-token/route.ts
git commit -m "feat: add /api/powerbi-token route via Azure CLI"
```

---

## Task 4: Create `/api/powerbi-export` route

**Files:**
- Create: `app/api/powerbi-export/route.ts`

### Context

This is the main orchestration route. It receives a FormData POST with three fields: `file` (the PBIX blob), `pages` (JSON array of internal page name strings), and `token` (Bearer token string). It runs six Power BI REST API calls sequentially, streams the PDF back, then fires-and-forgets cleanup. Polling uses exponential backoff with hard timeouts.

### Steps

- [ ] **Step 1: Create the file with helpers and types**

Create `app/api/powerbi-export/route.ts` with this content:

```typescript
import { NextRequest, NextResponse } from "next/server";

const PBI_BASE = "https://api.powerbi.com/v1.0/myorg";

async function pbiGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function pbiDelete(url: string, token: string): Promise<void> {
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function poll<T>(
  fn: () => Promise<T>,
  isDone: (val: T) => boolean,
  isFailed: (val: T) => boolean,
  intervalMs: number,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (isDone(val)) return val;
    if (isFailed(val)) throw new Error(`Polling failed: ${JSON.stringify(val)}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Polling timed out");
}

interface ImportStatus {
  id: string;
  importState: string;
  reports?: Array<{ id: string; name: string }>;
  datasets?: Array<{ id: string; name: string }>;
}

interface ExportStatus {
  id: string;
  reportId: string;
  status: string;
  resourceLocation?: string;
  percentComplete?: number;
}

export async function POST(req: NextRequest) {
  let datasetId: string | undefined;
  let reportId: string | undefined;
  let exportId: string | undefined;
  let token = "";

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const pagesJson = form.get("pages") as string | null;
    token = (form.get("token") as string | null) ?? "";

    if (!file || !pagesJson || !token) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const selectedPages: string[] = JSON.parse(pagesJson);
    const reportName = file.name.replace(/\.pbix$/i, "");

    // Step 1: Upload PBIX
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const uploadRes = await fetch(
      `${PBI_BASE}/imports?datasetDisplayName=${encodeURIComponent(reportName + "-export-tmp")}&nameConflict=Overwrite`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm,
      }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return NextResponse.json({ error: "upload_failed", detail: text, step: "upload" }, { status: 502 });
    }
    const { id: importId } = (await uploadRes.json()) as { id: string };

    // Step 2: Poll import
    const importResult = await poll<ImportStatus>(
      () => pbiGet<ImportStatus>(`${PBI_BASE}/imports/${importId}`, token),
      (v) => v.importState === "Succeeded",
      (v) => v.importState === "Failed",
      2000,
      60000
    );

    reportId = importResult.reports?.[0]?.id;
    datasetId = importResult.datasets?.[0]?.id;
    if (!reportId) throw new Error("Import succeeded but no report ID returned");

    // Step 3: Trigger PDF export
    const exportBody = {
      format: "PDF",
      pages: selectedPages.map((pageName) => ({ pageName })),
    };

    const exportRes = await fetch(`${PBI_BASE}/reports/${reportId}/ExportTo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exportBody),
    });
    if (!exportRes.ok) {
      const text = await exportRes.text();
      return NextResponse.json({ error: "export_trigger_failed", detail: text, step: "export" }, { status: 502 });
    }
    exportId = ((await exportRes.json()) as { id: string }).id;

    // Step 4: Poll export status
    await poll<ExportStatus>(
      () => pbiGet<ExportStatus>(`${PBI_BASE}/reports/${reportId}/exports/${exportId}`, token),
      (v) => v.status === "Succeeded",
      (v) => v.status === "Failed",
      3000,
      180000
    );

    // Step 5: Download PDF
    const pdfRes = await fetch(`${PBI_BASE}/reports/${reportId}/exports/${exportId}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pdfRes.ok) {
      throw new Error(`PDF download failed: ${pdfRes.status}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    // Step 6: Cleanup (fire-and-forget)
    if (datasetId) {
      pbiDelete(`${PBI_BASE}/datasets/${datasetId}`, token).catch(() => {/* ignore cleanup errors */});
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportName}.pdf"`,
      },
    });
  } catch (err: unknown) {
    // Best-effort cleanup on error
    if (datasetId && token) {
      pbiDelete(`${PBI_BASE}/datasets/${datasetId}`, token).catch(() => {});
    }

    const error = err as Error;
    return NextResponse.json({ error: "export_failed", detail: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/powerbi-export/route.ts
git commit -m "feat: add /api/powerbi-export route — Power BI REST API orchestration"
```

---

## Task 5: Create `PbixExportPanel` component

**Files:**
- Create: `components/PbixExportPanel.tsx`

### Context

This component handles the full export UX. It takes `loadedFiles` (the extended type with `rawFile`) and manages a state machine: `connecting` → `connected` | `error:no_cli` | `error:not_logged_in` → `exporting` → `done`. It auto-connects on mount and auto-refreshes the token 5 minutes before expiry.

### Steps

- [ ] **Step 1: Create the file**

Create `components/PbixExportPanel.tsx` with this full content:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { FileDown, CheckCircle2, AlertCircle, Loader2, Terminal } from "lucide-react";
import type { LoadedFile } from "@/lib/pbix-parser";

interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}

interface Props {
  loadedFiles: LoadedFileWithRaw[];
}

type AuthState =
  | { phase: "connecting" }
  | { phase: "connected"; token: string; expiresOn: string }
  | { phase: "error"; code: "azure_cli_not_found" | "not_logged_in" | "unknown"; detail?: string };

type ExportPhase =
  | "idle"
  | "uploading"
  | "importing"
  | "exporting"
  | "downloading"
  | "cleaning_up"
  | "done"
  | "failed";

const EXPORT_STEPS: { phase: ExportPhase; label: string }[] = [
  { phase: "uploading", label: "Uploading to Power BI…" },
  { phase: "importing", label: "Processing import…" },
  { phase: "exporting", label: "Generating PDF…" },
  { phase: "downloading", label: "Downloading…" },
  { phase: "cleaning_up", label: "Cleaning up…" },
];

async function fetchToken(): Promise<{ accessToken: string; expiresOn: string }> {
  const res = await fetch("/api/powerbi-token");
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error("token_error"), { code: data.error as string });
  return data;
}

export function PbixExportPanel({ loadedFiles }: Props) {
  const [auth, setAuth] = useState<AuthState>({ phase: "connecting" });
  const [selectedFile, setSelectedFile] = useState<LoadedFileWithRaw | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setAuth({ phase: "connecting" });
    try {
      const { accessToken, expiresOn } = await fetchToken();
      setAuth({ phase: "connected", token: accessToken, expiresOn });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      const code = error.code ?? "unknown";
      setAuth({
        phase: "error",
        code: code as "azure_cli_not_found" | "not_logged_in" | "unknown",
        detail: error.message,
      });
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // When loaded files change, update selected file if needed
  useEffect(() => {
    if (loadedFiles.length === 0) {
      setSelectedFile(null);
      setSelectedPages(new Set());
      return;
    }
    const current = selectedFile;
    const stillLoaded = current && loadedFiles.some((f) => f.fileName === current.fileName);
    if (!stillLoaded) {
      const first = loadedFiles[0];
      setSelectedFile(first);
      setSelectedPages(new Set(first.dashboard.pages.map((p) => p.internalName)));
    }
  }, [loadedFiles, selectedFile]);

  // Auto-refresh token 5 min before expiry
  useEffect(() => {
    if (auth.phase !== "connected") return;
    const expiresMs = new Date(auth.expiresOn).getTime();
    const refreshAt = expiresMs - 5 * 60 * 1000;
    const delay = refreshAt - Date.now();
    if (delay <= 0) {
      connect();
      return;
    }
    const timer = setTimeout(connect, delay);
    return () => clearTimeout(timer);
  }, [auth, connect]);

  const togglePage = useCallback((internalName: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(internalName)) next.delete(internalName);
      else next.add(internalName);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!selectedFile) return;
    setSelectedPages(new Set(selectedFile.dashboard.pages.map((p) => p.internalName)));
  }, [selectedFile]);

  const clearAll = useCallback(() => setSelectedPages(new Set()), []);

  const handleExport = useCallback(async () => {
    if (auth.phase !== "connected" || !selectedFile || selectedPages.size === 0) return;

    // Refresh token if expired
    let token = auth.token;
    if (Date.now() >= new Date(auth.expiresOn).getTime() - 60000) {
      try {
        const fresh = await fetchToken();
        token = fresh.accessToken;
        setAuth({ phase: "connected", token: fresh.accessToken, expiresOn: fresh.expiresOn });
      } catch {
        setAuth({ phase: "error", code: "not_logged_in" });
        return;
      }
    }

    setExportError(null);
    setExportPhase("uploading");

    try {
      const form = new FormData();
      form.append("file", selectedFile.rawFile);
      form.append("pages", JSON.stringify([...selectedPages]));
      form.append("token", token);

      // Simulate phase progression while waiting (the server handles all steps)
      const phaseTimer = [
        setTimeout(() => setExportPhase("importing"), 3000),
        setTimeout(() => setExportPhase("exporting"), 8000),
        setTimeout(() => setExportPhase("downloading"), 30000),
      ];

      const res = await fetch("/api/powerbi-export", { method: "POST", body: form });

      phaseTimer.forEach(clearTimeout);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? err.error ?? "Export failed");
      }

      setExportPhase("cleaning_up");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedFile.dashboard.reportName}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setExportPhase("done");
    } catch (err: unknown) {
      const error = err as Error;
      setExportPhase("failed");
      setExportError(error.message);
    }
  }, [auth, selectedFile, selectedPages]);

  if (loadedFiles.length === 0) return null;

  return (
    <div className="border-t border-theme px-6 py-4 flex-shrink-0">
      <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
        <FileDown className="w-4 h-4" />
        Export to PDF
      </h3>

      {/* Auth status */}
      {auth.phase === "connecting" && (
        <div className="flex items-center gap-2 text-xs text-secondary mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Connecting to Power BI…
        </div>
      )}

      {auth.phase === "connected" && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected to Power BI
        </div>
      )}

      {auth.phase === "error" && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {auth.code === "azure_cli_not_found" ? "Azure CLI not found" : "Not logged in to Azure"}
          </div>
          {auth.code === "azure_cli_not_found" ? (
            <div className="space-y-1">
              <p>Install Azure CLI, then log in with your work account:</p>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                winget install Microsoft.AzureCLI
              </code>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                az login
              </code>
            </div>
          ) : (
            <div className="space-y-1">
              <p>Run this once in a terminal to authenticate:</p>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                az login
              </code>
            </div>
          )}
          <button
            onClick={connect}
            className="mt-2 text-amber-700 dark:text-amber-400 underline text-xs"
          >
            Retry connection
          </button>
        </div>
      )}

      {/* File selector (multiple files) */}
      {loadedFiles.length > 1 && (
        <div className="mb-3">
          <label className="text-xs text-secondary block mb-1">File to export</label>
          <select
            value={selectedFile?.fileName ?? ""}
            onChange={(e) => {
              const f = loadedFiles.find((lf) => lf.fileName === e.target.value) ?? null;
              setSelectedFile(f);
              if (f) setSelectedPages(new Set(f.dashboard.pages.map((p) => p.internalName)));
            }}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {loadedFiles.map((f) => (
              <option key={f.fileName} value={f.fileName}>
                {f.dashboard.reportName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Page selection */}
      {auth.phase === "connected" && selectedFile && exportPhase === "idle" && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-secondary">Pages to include</label>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-brand-600 dark:text-brand-400 hover:underline">
                Select all
              </button>
              <span className="text-secondary">·</span>
              <button onClick={clearAll} className="text-brand-600 dark:text-brand-400 hover:underline">
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectedFile.dashboard.pages.map((page) => (
              <label
                key={page.internalName}
                className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:text-brand-600 dark:hover:text-brand-400"
              >
                <input
                  type="checkbox"
                  checked={selectedPages.has(page.internalName)}
                  onChange={() => togglePage(page.internalName)}
                  className="rounded border-theme accent-brand-600"
                />
                {page.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Export progress */}
      {exportPhase !== "idle" && exportPhase !== "done" && exportPhase !== "failed" && (
        <div className="space-y-1.5 mb-3">
          {EXPORT_STEPS.map(({ phase, label }) => {
            const stepIdx = EXPORT_STEPS.findIndex((s) => s.phase === exportPhase);
            const thisIdx = EXPORT_STEPS.findIndex((s) => s.phase === phase);
            const isDone = thisIdx < stepIdx;
            const isActive = phase === exportPhase;
            return (
              <div key={phase} className={`flex items-center gap-2 text-xs ${isDone ? "text-emerald-600 dark:text-emerald-400" : isActive ? "text-primary font-medium" : "text-slate-400"}`}>
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                ) : (
                  <div className="w-3.5 h-3.5 shrink-0 rounded-full border border-current opacity-30" />
                )}
                {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Done state */}
      {exportPhase === "done" && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PDF downloaded
          </div>
          <button
            onClick={() => setExportPhase("idle")}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            Export another
          </button>
        </div>
      )}

      {/* Error state */}
      {exportPhase === "failed" && exportError && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 mb-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Export failed
          </div>
          <p className="font-mono break-all">{exportError}</p>
          <button
            onClick={() => { setExportPhase("idle"); setExportError(null); }}
            className="mt-2 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Export button */}
      {auth.phase === "connected" && exportPhase === "idle" && (
        <button
          onClick={handleExport}
          disabled={selectedPages.size === 0 || !selectedFile}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Export {selectedPages.size} {selectedPages.size === 1 ? "page" : "pages"} as PDF
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/PbixExportPanel.tsx
git commit -m "feat: add PbixExportPanel component with auto-auth and page selection"
```

---

## Task 6: Wire `PbixExportPanel` into `PbixExplorerTab`

**Files:**
- Modify: `components/PbixExplorerTab.tsx`

### Steps

- [ ] **Step 1: Import `PbixExportPanel`**

In `components/PbixExplorerTab.tsx`, add to the imports:

```typescript
import { PbixExportPanel } from "@/components/PbixExportPanel";
```

- [ ] **Step 2: Remove the local `LoadedFileWithRaw` definition from `PbixExplorerTab`**

In Task 2 we added `LoadedFileWithRaw` directly to `PbixExplorerTab.tsx`. Since `PbixExportPanel.tsx` also defines it locally, that's fine — each file defines its own local copy. No change needed here.

- [ ] **Step 3: Add `PbixExportPanel` after the `PbixMeasuresView` branch**

At the bottom of the return JSX in `PbixExplorerTab`, just before the closing `</div>`, add `PbixExportPanel`. The full bottom of the `return` block should look like:

```tsx
      ) : (
        <PbixMeasuresView loadedFiles={loadedFiles} />
      )}
      <PbixExportPanel loadedFiles={loadedFiles} />
    </div>
  );
```

The `PbixExportPanel` receives `loadedFiles` which is `LoadedFileWithRaw[]`. The panel's `Props` expects `LoadedFileWithRaw[]`. Since both define `LoadedFileWithRaw` as `LoadedFile & { rawFile: File }` they are structurally compatible.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/PbixExplorerTab.tsx
git commit -m "feat: add PbixExportPanel to PbixExplorerTab"
```

---

## Task 7: End-to-end verification

### Prerequisites
- Azure CLI installed: `az --version` should return a version
- Logged in: `az account show` should return your account
- Power BI service access: able to sign in to app.powerbi.com

### Steps

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open http://localhost:3000 and navigate to the PBIX Explorer tab.

- [ ] **Step 2: Verify auto-connect**

The Export to PDF panel at the bottom should show "Connected to Power BI" with a green checkmark within a few seconds of page load. No user action required.

- [ ] **Step 3: Load a PBIX file**

Drag a `.pbix` file onto the drop zone. After parsing, the export panel should display a checkbox list of all pages in the report, all pre-selected.

- [ ] **Step 4: Select pages and export**

Uncheck one or two pages. Click "Export N pages as PDF". Watch the progress steps animate through: Uploading → Processing import → Generating PDF → Downloading → Cleaning up. A PDF file should download automatically.

- [ ] **Step 5: Verify cleanup**

Go to app.powerbi.com → My Workspace. Confirm there is no imported report with the name `{filename}-export-tmp` left behind.

- [ ] **Step 6: Verify multi-file scenario**

Load a second `.pbix` file. A dropdown should appear above the page list to switch between files. Confirm exporting each works independently.

- [ ] **Step 7: Verify error state**

To test the Azure CLI error path: temporarily rename `az.cmd` or test on a machine without Azure CLI. The panel should show the amber warning box with install instructions.

- [ ] **Step 8: Final type-check and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: complete Power BI PDF export feature"
```
