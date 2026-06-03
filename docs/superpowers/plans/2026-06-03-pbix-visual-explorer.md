# PBIX Visual Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "PBIX Visual Explorer" tab that lets users drop one or more `.pbix` files and instantly search/filter all visuals by title and type across all loaded files.

**Architecture:** All parsing happens client-side in the browser using JSZip (already a transitive dependency) and the browser-native `TextDecoder` API. A new `lib/pbix-parser-browser.ts` ports the existing server-side parser to run in the browser. A new `components/PbixExplorerTab.tsx` owns all tab state and UI. `app/page.tsx` gets a new tab button and renders the component.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, JSZip (already installed), lucide-react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/pbix-parser-browser.ts` | Parse `.pbix` `File` objects in the browser via JSZip + TextDecoder |
| Create | `components/PbixExplorerTab.tsx` | Full tab UI — drop zone, search, filters, results table, CSV export |
| Modify | `app/page.tsx` | Add tab type, tab button, render PbixExplorerTab |

---

## Task 1: Browser-compatible PBIX parser

**Files:**
- Create: `lib/pbix-parser-browser.ts`

This is a browser port of `lib/pbix-parser.ts`. The only differences are: `file.arrayBuffer()` instead of a Node `Buffer`, `layoutFile.async("uint8array")` instead of `"nodebuffer"`, and `TextDecoder` instead of `Buffer.toString`. Types are imported from the existing parser to avoid duplication.

- [ ] **Step 1: Create `lib/pbix-parser-browser.ts`**

```typescript
import JSZip from "jszip";
import type { PbixVisual, PbixPage, PbixDashboard } from "./pbix-parser";

interface VisualConfig {
  singleVisual?: {
    visualType?: string;
    vcObjects?: {
      title?: Array<{ properties?: { text?: { expr?: { Literal?: { Value?: string } } } } }>;
    };
  };
}

interface VisualContainer {
  config?: string;
  title?: string;
}

interface LayoutSection {
  displayName?: string;
  name?: string;
  visualContainers?: VisualContainer[];
}

interface ReportLayout {
  sections?: LayoutSection[];
}

function extractVisualTitle(config: VisualConfig): string | undefined {
  try {
    const val = config.singleVisual?.vcObjects?.title?.[0]?.properties?.text?.expr?.Literal?.Value;
    if (val) return val.replace(/^'|'$/g, "");
  } catch { /* ignore */ }
  return undefined;
}

export async function parsePbixFileClient(file: File): Promise<PbixDashboard> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const layoutFile = zip.file("Report/Layout");
  if (!layoutFile) {
    throw new Error("This file does not appear to be a valid .pbix — Report/Layout not found.");
  }

  const rawBytes = await layoutFile.async("uint8array");
  let layoutText = new TextDecoder("utf-16le").decode(rawBytes);
  if (layoutText.charCodeAt(0) === 0xfeff) {
    layoutText = layoutText.slice(1);
  }
  // Strip control characters invalid in JSON strings (keep \t=9, \n=10, \r=13)
  layoutText = layoutText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  const layout: ReportLayout = JSON.parse(layoutText);
  const reportName = file.name.replace(/\.pbix$/i, "").replace(/[_-]+/g, " ");

  const pages: PbixPage[] = (layout.sections ?? []).map((section) => {
    const pageName = section.displayName ?? section.name ?? "Unnamed Page";
    const visuals: PbixVisual[] = (section.visualContainers ?? [])
      .map((vc): PbixVisual | null => {
        if (!vc.config) return null;
        try {
          const config: VisualConfig = JSON.parse(vc.config);
          const visualType = config.singleVisual?.visualType;
          if (!visualType) return null;
          const title = extractVisualTitle(config) ?? vc.title;
          return { type: visualType, title };
        } catch { return null; }
      })
      .filter((v): v is PbixVisual => v !== null);
    return { name: pageName, visuals };
  });

  return { reportName, pages };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `pbix-parser-browser.ts`. If you see "Cannot find module 'jszip'", run `npm install jszip` then retry.

- [ ] **Step 3: Commit**

```bash
git add lib/pbix-parser-browser.ts
git commit -m "feat: add browser-compatible pbix parser"
```

---

## Task 2: PbixExplorerTab — drop zone and file loading

**Files:**
- Create: `components/PbixExplorerTab.tsx`

Build the component skeleton: drop zone + file input + loaded file pills + error pills. No search or table yet — just get files loading and appearing as pills.

- [ ] **Step 1: Create `components/PbixExplorerTab.tsx` with drop zone and file state**

```typescript
"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileBarChart2, AlertCircle } from "lucide-react";
import { parsePbixFileClient } from "@/lib/pbix-parser-browser";
import type { PbixDashboard } from "@/lib/pbix-parser";

interface LoadedFile {
  dashboard: PbixDashboard;
  fileName: string;
}

interface FileError {
  name: string;
}

export function PbixExplorerTab() {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pbix"));
    const newFiles: LoadedFile[] = [];
    const newErrors: FileError[] = [];

    for (const file of fileArray) {
      try {
        const dashboard = await parsePbixFileClient(file);
        newFiles.push({ dashboard, fileName: file.name });
      } catch {
        newErrors.push({ name: file.name });
      }
    }

    setLoadedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.fileName));
      return [...prev, ...newFiles.filter((r) => !existingNames.has(r.fileName))];
    });
    setFileErrors((prev) => [...prev, ...newErrors]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
      e.target.value = "";
    },
    [processFiles]
  );

  const removeFile = useCallback((fileName: string) => {
    setLoadedFiles((prev) => prev.filter((f) => f.fileName !== fileName));
  }, []);

  const removeError = useCallback((name: string) => {
    setFileErrors((prev) => prev.filter((e) => e.name !== name));
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Drop zone */}
      <div className="px-6 pt-4 pb-2 flex-shrink-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById("pbix-file-input")?.click()}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-colors ${
            isDragging
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
              : "border-theme hover:border-brand-400 bg-secondary"
          }`}
        >
          <Upload className="w-6 h-6 text-secondary" />
          <div className="text-center">
            <p className="text-sm font-medium text-primary">Drop .pbix files here</p>
            <p className="text-xs text-secondary mt-0.5">or click to browse — multiple files supported</p>
          </div>
        </div>
        <input
          id="pbix-file-input"
          type="file"
          accept=".pbix"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Loaded file pills + error pills */}
      {(loadedFiles.length > 0 || fileErrors.length > 0) && (
        <div className="flex flex-wrap gap-2 px-6 pb-2 flex-shrink-0">
          {loadedFiles.map((f) => (
            <span
              key={f.fileName}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
            >
              <FileBarChart2 className="w-3 h-3" />
              {f.dashboard.reportName}
              <button
                onClick={() => removeFile(f.fileName)}
                className="ml-0.5 hover:text-brand-900 dark:hover:text-brand-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {fileErrors.map((e) => (
            <span
              key={e.name}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-3 h-3" />
              {e.name} — not a valid .pbix
              <button
                onClick={() => removeError(e.name)}
                className="ml-0.5 hover:text-red-900 dark:hover:text-red-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Placeholder for search + table (added in Task 3) */}
      <div className="flex-1 flex items-center justify-center text-secondary">
        <div className="flex flex-col items-center gap-3">
          <FileBarChart2 className="w-10 h-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium">Drop a .pbix file above to get started</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `app/page.tsx` — add tab type, import, button, and render**

Open `app/page.tsx` and make these four changes:

**2a. Add `"pbix-explorer"` to the `AppTab` type (line 37):**
```typescript
type AppTab = "commenter" | "field-request" | "it-reference" | "clinician-guide" | "pbix-explorer";
```

**2b. Add import at the top of the file (after the existing component imports):**
```typescript
import { PbixExplorerTab } from "@/components/PbixExplorerTab";
```

**2c. Add `Search` to the lucide-react import (line 16) — add it to the existing destructured list:**
```typescript
import { Sparkles, Copy, Check, RotateCcw, AlertCircle, Loader2, FileText, ChevronDown, ChevronUp, Code2, TableProperties, Download, GitCompare, History, Bot, Users, Search } from "lucide-react";
```

**2d. Add the tab button after the Clinician Guide button (after line 212, before the closing `</div>` of the tab button group):**
```tsx
<button
  onClick={() => setActiveTab("pbix-explorer")}
  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-x border-t transition-colors ${
    activeTab === "pbix-explorer"
      ? "border-theme bg-primary text-primary"
      : "border-transparent text-secondary hover:text-primary"
  }`}
>
  <Search className="w-4 h-4" />
  PBIX Explorer
</button>
```

**2e. Add the tab render (after the clinician-guide render block around line 241):**
```tsx
{/* ── PBIX Explorer tab ── */}
{activeTab === "pbix-explorer" && <PbixExplorerTab />}
```

- [ ] **Step 3: Start the dev server and verify drop zone works**

```bash
npm run dev
```

Open `http://localhost:3000`. Click the "PBIX Explorer" tab. Verify:
- Drop zone renders with dashed border
- Dragging a `.pbix` file over it highlights the border (brand color)
- Dropping a `.pbix` file shows a blue pill with the report name and an ✕ button
- Dropping a non-`.pbix` file (or a corrupted file) shows a red error pill
- Clicking ✕ on a pill removes it
- Clicking the drop zone opens the file browser

- [ ] **Step 4: Commit**

```bash
git add components/PbixExplorerTab.tsx app/page.tsx
git commit -m "feat: add pbix explorer tab with drop zone and file loading"
```

---

## Task 3: Search bar, type dropdown, page chips, and results table

**Files:**
- Modify: `components/PbixExplorerTab.tsx`

Replace the entire file with the full component — adds filtering state, the search row, page chips, and the results table. The drop zone and pill logic from Task 2 is preserved unchanged.

- [ ] **Step 1: Replace `components/PbixExplorerTab.tsx` with the complete component**

```typescript
"use client";

import { useState, useCallback, useMemo } from "react";
import { Upload, X, FileBarChart2, AlertCircle, Search } from "lucide-react";
import { parsePbixFileClient } from "@/lib/pbix-parser-browser";
import type { PbixDashboard } from "@/lib/pbix-parser";

interface LoadedFile {
  dashboard: PbixDashboard;
  fileName: string;
}

interface FileError {
  name: string;
}

interface VisualRow {
  title: string;
  type: string;
  page: string;
  file: string;
}

export function PbixExplorerTab() {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchType, setSearchType] = useState("");
  const [selectedPage, setSelectedPage] = useState("");

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pbix"));
    const newFiles: LoadedFile[] = [];
    const newErrors: FileError[] = [];

    for (const file of fileArray) {
      try {
        const dashboard = await parsePbixFileClient(file);
        newFiles.push({ dashboard, fileName: file.name });
      } catch {
        newErrors.push({ name: file.name });
      }
    }

    setLoadedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.fileName));
      return [...prev, ...newFiles.filter((r) => !existingNames.has(r.fileName))];
    });
    setFileErrors((prev) => [...prev, ...newErrors]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
      e.target.value = "";
    },
    [processFiles]
  );

  const removeFile = useCallback((fileName: string) => {
    setLoadedFiles((prev) => prev.filter((f) => f.fileName !== fileName));
    setSelectedPage("");
  }, []);

  const removeError = useCallback((name: string) => {
    setFileErrors((prev) => prev.filter((e) => e.name !== name));
  }, []);

  // Flatten all visuals across all loaded files into a single list of rows
  const allRows = useMemo<VisualRow[]>(
    () =>
      loadedFiles.flatMap((f) =>
        f.dashboard.pages.flatMap((p) =>
          p.visuals.map((v) => ({
            title: v.title ?? "",
            type: v.type,
            page: p.name,
            file: f.dashboard.reportName,
          }))
        )
      ),
    [loadedFiles]
  );

  // Type options built dynamically from loaded data
  const typeOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.type))].sort(),
    [allRows]
  );

  // Rows after title + type filter (used for page chip counts)
  const titleTypeFiltered = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.title.toLowerCase().includes(searchTitle.toLowerCase()) &&
          (searchType === "" || r.type === searchType)
      ),
    [allRows, searchTitle, searchType]
  );

  // Page chips from title+type-filtered rows
  const pageChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of titleTypeFiltered) {
      counts.set(r.page, (counts.get(r.page) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [titleTypeFiltered]);

  // Final rows — all three filters applied
  const filteredRows = useMemo(
    () => titleTypeFiltered.filter((r) => selectedPage === "" || r.page === selectedPage),
    [titleTypeFiltered, selectedPage]
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Drop zone */}
      <div className="px-6 pt-4 pb-2 flex-shrink-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById("pbix-file-input")?.click()}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-colors ${
            isDragging
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
              : "border-theme hover:border-brand-400 bg-secondary"
          }`}
        >
          <Upload className="w-6 h-6 text-secondary" />
          <div className="text-center">
            <p className="text-sm font-medium text-primary">Drop .pbix files here</p>
            <p className="text-xs text-secondary mt-0.5">or click to browse — multiple files supported</p>
          </div>
        </div>
        <input
          id="pbix-file-input"
          type="file"
          accept=".pbix"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* File pills + error pills */}
      {(loadedFiles.length > 0 || fileErrors.length > 0) && (
        <div className="flex flex-wrap gap-2 px-6 pb-2 flex-shrink-0">
          {loadedFiles.map((f) => (
            <span
              key={f.fileName}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
            >
              <FileBarChart2 className="w-3 h-3" />
              {f.dashboard.reportName}
              <button
                onClick={() => removeFile(f.fileName)}
                className="ml-0.5 hover:text-brand-900 dark:hover:text-brand-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {fileErrors.map((e) => (
            <span
              key={e.name}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-3 h-3" />
              {e.name} — not a valid .pbix
              <button
                onClick={() => removeError(e.name)}
                className="ml-0.5 hover:text-red-900 dark:hover:text-red-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search row */}
      <div className="flex gap-3 px-6 pb-3 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary pointer-events-none" />
          <input
            type="text"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            placeholder="Search visual title…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={searchType}
          onChange={(e) => { setSearchType(e.target.value); setSelectedPage(""); }}
          className="px-2.5 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[160px]"
        >
          <option value="">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Page chips */}
      {pageChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-6 pb-3 flex-shrink-0">
          <button
            onClick={() => setSelectedPage("")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              selectedPage === ""
                ? "bg-brand-600 text-white"
                : "bg-panel border border-theme text-secondary hover:text-primary"
            }`}
          >
            All ({titleTypeFiltered.length})
          </button>
          {pageChips.map(([page, count]) => (
            <button
              key={page}
              onClick={() => setSelectedPage(page === selectedPage ? "" : page)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                selectedPage === page
                  ? "bg-brand-600 text-white"
                  : "bg-panel border border-theme text-secondary hover:text-primary"
              }`}
            >
              {page} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Results table */}
      <div className="flex-1 overflow-auto px-6">
        {loadedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-secondary">
            <FileBarChart2 className="w-10 h-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium">Drop a .pbix file above to get started</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-secondary">
            <Search className="w-8 h-8 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium">No visuals match your search</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-theme text-xs text-secondary uppercase tracking-wide">
                <th className="text-left py-2 px-2 font-semibold">Title</th>
                <th className="text-left py-2 px-2 font-semibold">Type</th>
                <th className="text-left py-2 px-2 font-semibold">Page</th>
                <th className="text-left py-2 px-2 font-semibold">File</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={i} className="border-b border-theme hover:bg-panel transition-colors">
                  <td className="py-2 px-2 font-medium text-primary">
                    {row.title || <span className="text-slate-400 italic">Untitled</span>}
                  </td>
                  <td className="py-2 px-2 text-secondary">{row.type}</td>
                  <td className="py-2 px-2 text-secondary">{row.page}</td>
                  <td className="py-2 px-2 text-secondary">{row.file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer placeholder — CSV export added in Task 4 */}
      {loadedFiles.length > 0 && (
        <div className="flex items-center justify-between px-6 py-2 border-t border-theme bg-panel text-xs text-secondary flex-shrink-0">
          <span>
            Showing {filteredRows.length} of {allRows.length} visuals across {loadedFiles.length}{" "}
            {loadedFiles.length === 1 ? "file" : "files"}, {pageChips.length}{" "}
            {pageChips.length === 1 ? "page" : "pages"}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the table renders and filters work**

With the dev server running, drop a `.pbix` file into the tab. Verify:
- All visuals appear in the table immediately (browse mode)
- Typing in the title search box filters the table live
- Selecting a type from the dropdown filters to that type only
- Page chips appear and clicking one narrows the table to that page
- Clicking a selected page chip again (or "All") resets the page filter
- The footer shows the correct counts ("Showing X of Y visuals across Z files, N pages")

- [ ] **Step 3: Commit**

```bash
git add components/PbixExplorerTab.tsx
git commit -m "feat: add search, type filter, page chips, and results table to pbix explorer"
```

---

## Task 4: CSV export

**Files:**
- Modify: `components/PbixExplorerTab.tsx`

Add the `handleCsvExport` callback and the "Copy results as CSV" button in the footer. The export respects the current title, type, and page filters.

- [ ] **Step 1: Add `handleCsvExport` to the component**

In `components/PbixExplorerTab.tsx`, add this callback **after the `filteredRows` useMemo** (it must come after `filteredRows` is declared, since it depends on it):

```typescript
const handleCsvExport = useCallback(() => {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = "Title,Type,Page,File";
  const rows = filteredRows.map((r) =>
    [r.title, r.type, r.page, r.file].map(escape).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pbix-visuals.csv";
  a.click();
  URL.revokeObjectURL(url);
}, [filteredRows]);
```

- [ ] **Step 2: Add the button to the footer**

Replace the footer div (currently showing only the count) with:

```tsx
{loadedFiles.length > 0 && (
  <div className="flex items-center justify-between px-6 py-2 border-t border-theme bg-panel text-xs text-secondary flex-shrink-0">
    <span>
      Showing {filteredRows.length} of {allRows.length} visuals across {loadedFiles.length}{" "}
      {loadedFiles.length === 1 ? "file" : "files"}, {pageChips.length}{" "}
      {pageChips.length === 1 ? "page" : "pages"}
    </span>
    <button
      onClick={handleCsvExport}
      className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
    >
      Copy results as CSV
    </button>
  </div>
)}
```

- [ ] **Step 3: Verify CSV export**

With a `.pbix` file loaded, apply a search filter (e.g., type "Provider" in the title box). Click "Copy results as CSV". Verify:
- A file named `pbix-visuals.csv` downloads
- Opening it shows only the filtered rows (not all visuals)
- The header row is `Title,Type,Page,File`
- Values containing commas or quotes are properly escaped with double-quotes

- [ ] **Step 4: Commit**

```bash
git add components/PbixExplorerTab.tsx
git commit -m "feat: add csv export to pbix explorer"
```

---

## Task 5: Final verification

- [ ] **Step 1: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full end-to-end smoke test**

With `npm run dev` running, go through this checklist in the browser:

1. Click "PBIX Explorer" tab — drop zone shows, empty state shows below it
2. Drop one `.pbix` file — blue pill appears, all visuals load in browse mode, footer shows correct count
3. Drop a second `.pbix` file — second pill appears, rows from both files appear, footer updates file count
4. Type a partial title (e.g., "Provider") — table filters live, page chips update their counts
5. Select a visual type from the dropdown — table narrows, page chips update
6. Click a page chip — table narrows to that page
7. Click the same page chip again — resets to "All"
8. Remove a file with ✕ — its rows disappear, counts update, page filter resets
9. Drop a non-`.pbix` file — red error pill appears, no crash
10. Click ✕ on the error pill — it disappears
11. With a filtered view, click "Copy results as CSV" — file downloads with only the visible rows
12. Verify the other tabs (Code Commenter, Field Request, IT Reference, Clinician Guide) still work normally

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
git add -p
git commit -m "fix: pbix explorer final polish"
```
