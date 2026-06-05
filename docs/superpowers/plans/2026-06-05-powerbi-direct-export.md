# Power BI Direct Browser Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Power BI REST API orchestration from the Next.js API route into the browser so PBIX uploads bypass Vercel's 4.5 MB serverless body limit.

**Architecture:** A new `lib/powerbi-export-client.ts` file holds the full async orchestration (upload → poll import → trigger export → poll export → download PDF → cleanup). `PbixExportPanel.tsx` calls this single function via a progress callback, replacing the current fake-timer phase transitions with real API-driven ones. The `app/api/powerbi-export/route.ts` route is deleted entirely.

**Tech Stack:** TypeScript, browser Fetch API, Power BI REST API (`api.powerbi.com/v1.0/myorg`), Next.js 16 App Router

---

## Task 1: Create `lib/powerbi-export-client.ts`

**Files:**
- Create: `lib/powerbi-export-client.ts`

- [ ] **Step 1: Create the file with the full implementation**

Create `lib/powerbi-export-client.ts` with this exact content:

```typescript
const PBI_BASE = "https://api.powerbi.com/v1.0/myorg";

export type ExportPhase =
  | "idle"
  | "uploading"
  | "importing"
  | "exporting"
  | "downloading"
  | "cleaning_up"
  | "done"
  | "failed";

export interface ExportOptions {
  file: File;
  selectedPages: string[];
  token: string;
  onPhase: (phase: ExportPhase) => void;
}

async function pbiRequest(url: string, token: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      "Could not reach Power BI directly — your browser may be blocking cross-origin requests"
    );
  }
}

async function poll<T>(
  fn: () => Promise<T>,
  isDone: (val: T) => boolean,
  isFailed: (val: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (isDone(val)) return val;
    if (isFailed(val)) throw new Error("Power BI reported export failure");
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  throw new Error(timeoutMessage);
}

interface ImportStatus {
  importState: string;
  reports?: Array<{ id: string; name: string }>;
  datasets?: Array<{ id: string; name: string }>;
}

interface ExportStatus {
  status: string;
}

export async function exportPbixToPdf({
  file,
  selectedPages,
  token,
  onPhase,
}: ExportOptions): Promise<void> {
  let datasetId: string | undefined;

  try {
    // Step 1: Upload PBIX directly to Power BI
    const reportName = file.name.replace(/\.pbix$/i, "");
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const uploadRes = await pbiRequest(
      `${PBI_BASE}/imports?datasetDisplayName=${encodeURIComponent(
        reportName + "-export-tmp"
      )}&nameConflict=Overwrite`,
      token,
      { method: "POST", body: uploadForm }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`Upload failed: ${text || uploadRes.status}`);
    }
    const { id: importId } = (await uploadRes.json()) as { id: string };

    // Step 2: Poll import status
    onPhase("importing");
    const importResult = await poll<ImportStatus>(
      async () => {
        const res = await pbiRequest(`${PBI_BASE}/imports/${importId}`, token);
        if (!res.ok) throw new Error(`Import status check failed: ${res.status}`);
        return res.json() as Promise<ImportStatus>;
      },
      (v) => v.importState === "Succeeded",
      (v) => v.importState === "Failed",
      2000,
      60000,
      "Import timed out"
    );

    const reportId = importResult.reports?.[0]?.id;
    datasetId = importResult.datasets?.[0]?.id;
    if (!reportId) throw new Error("Import succeeded but no report ID returned");

    // Step 3: Trigger PDF export
    onPhase("exporting");
    const exportRes = await pbiRequest(`${PBI_BASE}/reports/${reportId}/ExportTo`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "PDF",
        pages: selectedPages.map((pageName) => ({ pageName })),
      }),
    });
    if (!exportRes.ok) {
      const text = await exportRes.text().catch(() => "");
      throw new Error(`Export trigger failed: ${text || exportRes.status}`);
    }
    const { id: exportId } = (await exportRes.json()) as { id: string };

    // Step 4: Poll export status
    await poll<ExportStatus>(
      async () => {
        const res = await pbiRequest(
          `${PBI_BASE}/reports/${reportId}/exports/${exportId}`,
          token
        );
        if (!res.ok) throw new Error(`Export status check failed: ${res.status}`);
        return res.json() as Promise<ExportStatus>;
      },
      (v) => v.status === "Succeeded",
      (v) => v.status === "Failed",
      3000,
      180000,
      "Export generation timed out"
    );

    // Step 5: Download PDF blob
    onPhase("downloading");
    const pdfRes = await pbiRequest(
      `${PBI_BASE}/reports/${reportId}/exports/${exportId}/file`,
      token
    );
    if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);
    const blob = await pdfRes.blob();

    // Step 6: Trigger browser download
    onPhase("cleaning_up");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    // Fire-and-forget cleanup
    if (datasetId) {
      fetch(`${PBI_BASE}/datasets/${datasetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
rtk npx tsc --noEmit
```

Expected: no errors related to `lib/powerbi-export-client.ts`

- [ ] **Step 3: Commit**

```bash
rtk git add lib/powerbi-export-client.ts
rtk git commit -m "feat: add powerbi-export-client lib for direct browser orchestration"
```

---

## Task 2: Update `PbixExportPanel.tsx`

**Files:**
- Modify: `components/PbixExportPanel.tsx`

- [ ] **Step 1: Add the new import and remove the local `ExportPhase` type**

In `components/PbixExportPanel.tsx`, add one import line after the existing `import type { LoadedFile }` line:

```typescript
// Add this line (after the LoadedFile import):
import { exportPbixToPdf, type ExportPhase } from "@/lib/powerbi-export-client";
```

Then delete the local `ExportPhase` type block (lines 24–32 in the original file):

```typescript
// DELETE this entire block:
type ExportPhase =
  | "idle"
  | "uploading"
  | "importing"
  | "exporting"
  | "downloading"
  | "cleaning_up"
  | "done"
  | "failed";
```

All other types (`LoadedFileWithRaw`, `Props`, `AuthState`, `EXPORT_STEPS`) remain unchanged.

- [ ] **Step 2: Remove `phaseTimersRef` and its cleanup effect**

Remove the `phaseTimersRef` ref declaration (currently line 73):
```typescript
// DELETE this line:
const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
```

Remove the timer cleanup effect (currently lines 77–82):
```typescript
// DELETE this block:
useEffect(() => {
  return () => {
    phaseTimersRef.current.forEach(clearTimeout);
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  };
}, []);
```

Replace with a cleanup effect that only cancels the auth poll timer:
```typescript
useEffect(() => {
  return () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  };
}, []);
```

- [ ] **Step 3: Replace `handleExport`**

Replace the entire `handleExport` function (currently lines 197–269) with:

```typescript
const handleExport = useCallback(async () => {
  if (auth.phase !== "connected" || !selectedFile || selectedPages.size === 0) return;

  if (Date.now() >= new Date(auth.expiresOn).getTime() - 5 * 60 * 1000) {
    setAuth({ phase: "expired" });
    return;
  }

  setExportError(null);
  setExportPhase("uploading");

  try {
    await exportPbixToPdf({
      file: selectedFile.rawFile,
      selectedPages: [...selectedPages],
      token: auth.token,
      onPhase: setExportPhase,
    });
    setExportPhase("done");
  } catch (err: unknown) {
    const error = err as Error;
    setExportPhase("failed");
    setExportError(error.message || "Export failed");
  }
}, [auth, selectedFile, selectedPages]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
rtk npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Verify Next.js build succeeds**

```bash
rtk next build
```

Expected: build completes without errors; `/api/powerbi-export` still appears in route output (not yet deleted)

- [ ] **Step 6: Commit**

```bash
rtk git add components/PbixExportPanel.tsx
rtk git commit -m "feat: wire PbixExportPanel to direct browser export client, remove fake timers"
```

---

## Task 3: Delete the server-side export route

**Files:**
- Delete: `app/api/powerbi-export/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rtk git rm app/api/powerbi-export/route.ts
```

- [ ] **Step 2: Verify Next.js build still succeeds**

```bash
rtk next build
```

Expected: build completes; `/api/powerbi-export` no longer appears in the route output

- [ ] **Step 3: Commit**

```bash
rtk git commit -m "chore: remove server-side powerbi-export route (replaced by direct browser calls)"
```

---

## Task 4: Deploy to production

- [ ] **Step 1: Deploy**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx vercel --prod
```

Expected: build succeeds on Vercel, production URL printed at end of output

- [ ] **Step 2: Smoke-test in production**

Open the production URL, load a PBIX file larger than 4.5 MB, sign in to Power BI, select pages, and click Export. Verify the progress steps advance through uploading → importing → exporting → downloading → cleaning up and the PDF downloads.

- [ ] **Step 3: Confirm cleanup**

After the export completes, open the Power BI service (app.powerbi.com) and confirm no `-export-tmp` datasets remain in the workspace.
