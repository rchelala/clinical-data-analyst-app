# PBIX Visual Explorer — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

## Overview

A new tab ("PBIX Visual Explorer") added to the existing web app. Users drag one or more `.pbix` files onto a drop zone, and the tab immediately displays all visuals from those files in a searchable, filterable table. Parsing is done entirely client-side — no files are uploaded to the server.

## Goals

- Let users quickly find visuals across one or more Power BI reports by title and/or type
- Support multi-file searches with results combined into one table
- Zero server involvement — files never leave the browser

## Non-Goals

- Editing or modifying `.pbix` files
- Displaying visual data or DAX measures from the report
- Persisting loaded files across sessions

---

## User Flow

1. User navigates to the **PBIX Visual Explorer** tab
2. Drop zone is shown; user drags one or more `.pbix` files onto it (or clicks to browse)
3. Files are parsed client-side and all visuals appear immediately in browse mode (no search term required)
4. User types in the title search box and/or selects a visual type from the dropdown — table filters live as they type
5. User clicks a page chip to narrow results to a specific page
6. User can remove an individual file via its ✕ pill; results update immediately
7. User can click "Copy results as CSV" to download the current filtered view

---

## Architecture

### New Files

**`lib/pbix-parser-browser.ts`**  
Browser-compatible port of the existing `lib/pbix-parser.ts`. Key differences:
- `file.arrayBuffer()` replaces `Buffer` for reading the file
- `layoutFile.async("uint8array")` replaces `"nodebuffer"` in JSZip
- `new TextDecoder("utf-16le").decode(uint8array)` replaces `rawBuffer.toString("utf16le")`
- Exports the same `PbixDashboard`, `PbixPage`, `PbixVisual` interfaces (re-exported from the existing file to avoid duplication)
- Exports `parsePbixFileClient(file: File): Promise<PbixDashboard>`

**`components/PbixExplorerTab.tsx`**  
Self-contained tab component. Owns all state for this feature:
- `files: PbixDashboard[]` — parsed results, one per loaded file
- `fileErrors: { name: string; error: string }[]` — parse failures shown as inline error pills
- `searchTitle: string` — live title filter
- `searchType: string` — selected type filter ("" means all)
- `selectedPage: string` — selected page chip ("" means all)

### Existing Files Touched

**`app/page.tsx`**  
- Add `"pbix-explorer"` to the `AppTab` union type
- Add tab button with a `Search` icon (from lucide-react)
- Render `<PbixExplorerTab />` when `activeTab === "pbix-explorer"`

---

## Component Layout

```
PbixExplorerTab
├── Drop zone (drag-and-drop + click-to-browse, accepts .pbix only)
├── Loaded files strip (pill per file, each with ✕ to remove)
├── Error pills (one per failed parse, shown inline)
├── Search row
│   ├── Title input (live filter, placeholder: "Search visual title…")
│   └── Type dropdown (dynamically built from loaded data, "All types" default)
├── Page chips (dynamically built: "All (N)" + one per unique page name)
├── Results table
│   ├── Columns: Title | Type | Page | File
│   └── Empty state: "Drop a .pbix file above to get started" (no files) or "No visuals match your search" (files loaded, no matches)
└── Footer: "Showing X of Y visuals across Z files, N pages" + "Copy results as CSV"
```

---

## Filtering Logic

All filtering is pure in-memory computation — no API calls.

Given `files: PbixDashboard[]`, the flat list of all rows is:
```
files.flatMap(f => f.pages.flatMap(p => p.visuals.map(v => ({ file: f.reportName, page: p.name, title: v.title ?? "", type: v.type }))))
```

Applied filters (all AND-combined):
1. **Title:** `row.title.toLowerCase().includes(searchTitle.toLowerCase())` — visuals with no title (`title` is optional in the parser) are stored as `""` and appear as a blank cell; they match any title search term including an empty search
2. **Type:** `searchType === "" || row.type.toLowerCase().includes(searchType.toLowerCase())`
3. **Page:** `selectedPage === "" || row.page === selectedPage`

The type dropdown options are built from `[...new Set(allRows.map(r => r.type))].sort()`.

Page chips are built from `[...new Set(allRows.map(r => r.page))]`, each showing the count of rows on that page matching the current title+type filters.

---

## CSV Export

Triggered by "Copy results as CSV" in the footer. Exports the **currently filtered rows** (not all rows). Format:

```
Title,Type,Page,File
"Provider Count","Card","Overview","MAW Report"
"Provider Filter","Slicer","Overview","MAW Report"
```

Values are double-quoted and internal double-quotes are escaped as `""`. Triggers a browser download with filename `pbix-visuals.csv`.

---

## Error Handling

- If `parsePbixFileClient()` throws, the file is not added to `files`. Instead, an error entry is added to `fileErrors` and shown as a red pill: `"filename.pbix — not a valid .pbix file"`.
- Files that fail silently (parse succeeds but returns 0 pages) are treated as valid but show 0 rows in the table.
- Only `.pbix` files are accepted by the drop zone (enforced via `accept=".pbix"` on the hidden file input and by checking `file.name.endsWith(".pbix")` on drop).

---

## Styling

Follows existing app conventions:
- Tab button uses the same `rounded-t-lg border-x border-t` pattern as other tabs
- Icon: `Search` from lucide-react
- Drop zone: dashed border using `border-dashed border-2 border-theme`, with hover state highlighting
- File pills: same style as used elsewhere in the app (rounded, brand-colored border)
- Table: consistent with the app's existing `text-xs`, `text-secondary`, `border-theme` tokens
