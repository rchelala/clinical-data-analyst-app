# Design: Power BI Direct Browser Export

**Date:** 2026-06-05
**Status:** Approved

## Problem

Vercel enforces a hard 4.5 MB body limit on serverless function requests. PBIX files routinely exceed this. The current export route (`app/api/powerbi-export/route.ts`) receives the full PBIX upload through Next.js, which triggers a 413 before any Power BI API call is made.

## Solution

Move all Power BI REST API calls from the Next.js route into the browser. The OAuth bearer token is already available client-side (sessionStorage). The browser uploads the PBIX file directly to `api.powerbi.com`, orchestrates the full export pipeline, and downloads the resulting PDF blob — Vercel is never in the data path.

## Architecture

### Files changed

| File | Change |
|---|---|
| `lib/powerbi-export-client.ts` | **New** — all PBI REST orchestration |
| `components/PbixExportPanel.tsx` | **Updated** — calls new lib, real progress steps |
| `app/api/powerbi-export/route.ts` | **Deleted** |

### Why extract to a lib file

`PbixExportPanel.tsx` already handles auth state, page selection, timers, and UI rendering. Adding the full orchestration inline would make it very large. `lib/powerbi-export-client.ts` keeps a clear boundary: pure async orchestration functions with no React dependencies, easy to test or replace independently.

## Data Flow

```
Browser (token in sessionStorage)          api.powerbi.com
  │
  ├─ POST /imports?datasetDisplayName=…    ──▶  { importId }
  │   body: FormData { file: <pbix> }
  │
  ├─ GET  /imports/{importId}              ──▶  poll until importState === "Succeeded"
  │                                              → { reportId, datasetId }
  │
  ├─ POST /reports/{reportId}/ExportTo     ──▶  { exportId }
  │   body: { format: "PDF", pages: [...] }
  │
  ├─ GET  /reports/{reportId}/exports/{exportId}  ──▶  poll until status === "Succeeded"
  │
  ├─ GET  /reports/{reportId}/exports/{exportId}/file  ──▶  PDF ArrayBuffer
  │   → Blob URL → anchor click → browser download
  │
  └─ DELETE /datasets/{datasetId}          (fire-and-forget cleanup)
```

No Next.js route is involved after auth. The PDF bytes go directly from Power BI to the browser's download.

## Progress Steps

The current implementation uses fake timers to drive phase transitions. With direct API access we drive them from real API responses:

| Phase | Trigger |
|---|---|
| `uploading` | Set on button click, before the import POST |
| `importing` | Set when import POST returns `importId` |
| `exporting` | Set when import polling resolves with `reportId` |
| `downloading` | Set when export polling resolves with `status: Succeeded` |
| `cleaning_up` | Set when PDF blob is received, before triggering download |
| `done` | Set after download is initiated |

All fake `setTimeout` phase timers are removed.

## `lib/powerbi-export-client.ts` Interface

```typescript
// ExportPhase type is defined in this lib file and imported by PbixExportPanel
export type ExportPhase = "idle" | "uploading" | "importing" | "exporting" | "downloading" | "cleaning_up" | "done" | "failed";

export interface ExportOptions {
  file: File;
  selectedPages: string[];
  token: string;
  onPhase: (phase: ExportPhase) => void;  // progress callbacks
}

export async function exportPbixToPdf(options: ExportOptions): Promise<void>
// Throws on failure; caller catches and sets error state.
// Cleanup (dataset delete) is fire-and-forget inside this function.
```

A single exported function keeps the component integration minimal. Progress is reported via callback rather than return values so the component can update React state mid-flight.

## Error Handling

| Scenario | Behaviour |
|---|---|
| CORS blocked | `fetch` throws a network error → caught → shown as `"Could not reach Power BI directly — your browser may be blocking cross-origin requests"` |
| PBI API non-2xx | Response body text extracted and thrown as the error message |
| Import polling timeout (60 s) | Thrown as `"Import timed out"` |
| Export polling timeout (180 s) | Thrown as `"Export generation timed out"` |
| Export status `Failed` | Thrown as `"Power BI reported export failure"` |
| Cleanup failure | Silently swallowed (same as today) |

All errors propagate to `handleExport`'s catch block, which sets `exportPhase = "failed"` and `exportError = error.message` — no new error UI needed.

## What Is Not Changed

- Auth flow (`/api/powerbi-auth/start`, `/api/powerbi-auth/poll`) — unchanged
- Token caching in sessionStorage — unchanged
- Page selection UI — unchanged
- Error and progress UI components — unchanged
- All other app features — unaffected
