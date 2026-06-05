# Power BI PDF Export — Design Spec

**Date:** 2026-06-05
**Status:** Approved

---

## Context

The user loads PBIX files into the app's PBIX Explorer tab to inspect Power BI report structure. They want to export selected pages from a PBIX as a rendered PDF — for use as source material in Remotion video projects. Power BI Desktop's native export exists but requires manually opening each file; the goal is a one-click export directly from the web app.

Because the PBIX format requires the Power BI rendering engine for actual visual output, this feature integrates with the **Power BI REST API** to upload the file temporarily, trigger a server-side PDF render of selected pages, download the result, and clean up the temporary upload.

Auth is handled via the **Azure CLI** — the app's backend silently calls `az account get-access-token` to obtain a Bearer token. Users need Azure CLI installed and `az login` run once. After that, auth is completely invisible.

---

## Architecture

Three layers:

1. **Frontend panel** (`PbixExportPanel`) — embedded in `PbixExplorerTab` below the existing visuals/measures table. Auto-connects on mount; shows page checkboxes and export controls when a file is loaded.
2. **Token route** (`/api/powerbi-token`) — backend shells out to Azure CLI to get a Power BI Bearer token silently.
3. **Export route** (`/api/powerbi-export`) — orchestrates the full Power BI REST API sequence: upload → poll → export → poll → download → cleanup.

---

## PBIX Parser Change

**File:** `lib/pbix-parser-browser.ts`

The `Report/Layout` JSON contains sections with two name fields:
- `name` — internal ID used by the Power BI API (e.g., `ReportSection1`)
- `displayName` — human-readable label shown in Power BI Desktop (e.g., `"Sales Overview"`)

The parser currently returns only display names. Update it to return both. The `LoadedFile` interface (defined in `lib/pbix-parser.ts`) needs a `pages` field:

```typescript
interface ReportPage {
  name: string;        // internal API name
  displayName: string; // user-facing label
}
```

Update `LoadedFile` to include `pages: ReportPage[]`.

---

## Backend: `/api/powerbi-token`

**Method:** GET  
**Auth:** none (calls local Azure CLI)

Shells out: `az account get-access-token --resource https://analysis.windows.net/powerbi/api`

Parses the JSON output and returns:
```json
{ "accessToken": "...", "expiresOn": "2026-06-05T15:00:00Z" }
```

Error cases:
- Azure CLI not installed → 503 with `{ "error": "azure_cli_not_found" }`
- Not logged in → 401 with `{ "error": "not_logged_in" }`

---

## Backend: `/api/powerbi-export`

**Method:** POST  
**Body:** FormData — `file` (PBIX blob), `pages` (JSON array of internal page names), `token` (Bearer token)

### Power BI REST API sequence

Base URL: `https://api.powerbi.com/v1.0/myorg`

1. **Upload PBIX**
   ```
   POST /imports?datasetDisplayName={reportName}-export-tmp&nameConflict=Overwrite
   Content-Type: multipart/form-data
   Authorization: Bearer {token}
   ```
   Returns `{ id: importId }`.

2. **Poll import status** — every 2s, up to 60s timeout
   ```
   GET /imports/{importId}
   ```
   Until `importState === "Succeeded"`. Extract `reports[0].id` (reportId) and `datasets[0].id` (datasetId).

3. **Trigger PDF export**
   ```
   POST /reports/{reportId}/ExportTo
   { "format": "PDF", "pages": [{ "pageName": "ReportSection1" }, ...] }
   ```
   Returns `{ id: exportId }`.

4. **Poll export status** — every 3s, up to 3 min timeout
   ```
   GET /reports/{reportId}/exports/{exportId}
   ```
   Until `status === "Succeeded"`.

5. **Download PDF**
   ```
   GET /reports/{reportId}/exports/{exportId}/file
   ```
   Stream response body back to the Next.js client.

6. **Cleanup** (fire-and-forget, non-blocking)
   ```
   DELETE /datasets/{datasetId}
   ```

Return the PDF as `application/pdf` with `Content-Disposition: attachment; filename="{reportName}.pdf"`.

**Error handling:** If any step fails (non-2xx, timeout, or Power BI error body), attempt cleanup, then return a JSON error with `{ "error": "...", "step": "upload|import|export|download" }`.

---

## Frontend: `PbixExportPanel`

**New file:** `components/PbixExportPanel.tsx`  
**Props:** `loadedFiles: LoadedFile[]`

### States

| State | UI |
|---|---|
| `connecting` | Spinner + "Connecting to Power BI…" |
| `connected` | Green dot + "Connected" + page list + Export button |
| `error:no_cli` | Warning box with Azure CLI install instructions (`winget install Microsoft.AzureCLI` + `az login`) |
| `error:not_logged_in` | Warning box with `az login` instructions |
| `exporting` | Progress indicator with step labels |
| `done` | "PDF downloaded" confirmation, reset button |

### Auto-connect

On mount (and when `loadedFiles` changes from empty to populated), the panel calls `GET /api/powerbi-token`. If successful, stores the token in component state. If the token's `expiresOn` is within 5 minutes, re-fetches automatically before any export.

### Page selection UI

When connected and a file is loaded:
- Dropdown or label shows the loaded file name (if multiple files, a file picker appears)
- Checkbox list of pages (display names), default all selected
- "Select All" / "Clear All" shortcuts
- "Export to PDF" button — disabled if no pages selected

### Export progress

When exporting, replace the page list with a step indicator:
- Uploading to Power BI…
- Processing import…
- Generating PDF…
- Downloading…
- Cleaning up…

Each step lights up as it completes.

### Token refresh

Before calling `/api/powerbi-export`, check if `Date.now() >= expiresOn - 5min`. If so, re-fetch token first (silent, no UI change).

---

## Integration in `PbixExplorerTab`

`PbixExportPanel` is rendered at the bottom of the existing tab, below the visuals/measures table. It only renders when `loadedFiles.length > 0`. Pass `loadedFiles` directly — no new state needed.

---

## Files Changed

| File | Change |
|---|---|
| `lib/pbix-parser.ts` | Add `ReportPage` interface; add `pages: ReportPage[]` to `LoadedFile` |
| `lib/pbix-parser-browser.ts` | Extract both `name` and `displayName` per section; populate `pages` |
| `app/api/powerbi-token/route.ts` | New — Azure CLI token endpoint |
| `app/api/powerbi-export/route.ts` | New — Power BI REST API orchestration |
| `components/PbixExportPanel.tsx` | New — export UI panel |
| `components/PbixExplorerTab.tsx` | Add `PbixExportPanel` at bottom; pass `loadedFiles` |

No new npm dependencies.

---

## One-Time User Prerequisites

```
winget install Microsoft.AzureCLI   # if not installed
az login                             # once — browser opens for Microsoft sign-in
```

After that, all exports are one-click with no visible auth.

---

## Verification

1. Load a PBIX file in the explorer → Export panel appears with "Connected" status
2. Uncheck some pages, click "Export to PDF" → progress steps animate
3. PDF downloads with correct filename
4. Verify in Power BI service that no stray imported reports remain after export
5. Wait for token to expire (~1 hour) or manipulate `expiresOn` → re-connect happens silently before next export
6. Remove Azure CLI → panel shows install instructions instead of crashing
