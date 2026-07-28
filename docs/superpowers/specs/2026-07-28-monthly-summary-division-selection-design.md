# Monthly Summary — Division Selection for Export

**Date:** 2026-07-28
**Status:** Approved (design)

## Problem

In the Monthly Summary section, the Excel and Word exports always cover **every**
division that had activity in the selected month. To share a report for just one
or a few divisions, the user currently downloads the full document and manually
deletes the divisions they don't want. This is tedious and error-prone.

## Goal

Let the user check one or more divisions on screen and have the Excel / Word
export populate from only the checked divisions. The full-month behavior must
remain the default and stay byte-for-byte unchanged when nothing is deselected.

## Non-Goals

- No change to the underlying data fetch (`getMonthlySummaryData`) or types.
- No cross-month or multi-month selection.
- No per-group / per-analyst filtering — selection granularity is the division.

## Behavior

- Each division card gets a checkbox in its header. **All start checked** when a
  month's summary loads.
- A **"Select all / Deselect all"** control sits above the division list with a
  live count (e.g. "3 of 5 selected").
- The four KPI cards (Divisions / New / Completed / Net open) **recompute live**
  from only the checked divisions, so the on-screen numbers match what will
  export.
- Unchecked cards stay visible (needed to re-check them) but **dim slightly** to
  signal exclusion.
- **Excel** and **Word** buttons export only the checked divisions. If the user
  deselects every division, both buttons are **disabled**.

## Selection → Export wiring

- The export links already carry `?month=YYYY-MM`. Append
  `&divisions=id1,id2,id3` (comma-separated division IDs) when a subset is
  checked.
- **When all divisions are checked, omit the `divisions` param entirely** — the
  URL is then identical to today's, keeping the "everything" case unchanged.

## Route changes (Excel + Word)

Both `app/api/overview/monthly-summary/excel/route.ts` and `.../word/route.ts`:

1. Parse an optional `divisions` query param (comma-separated IDs).
2. If present, filter `data.divisions` to that ID set **after** the fetch, and
   recompute the totals used in the Excel Summary sheet / Word totals line from
   the filtered set.
3. If absent, behave exactly as today.
4. Unknown / empty IDs are ignored. If filtering leaves **zero** divisions,
   return `400` with `{ error: "No matching divisions selected." }`.
5. When filtered (param present and not covering all divisions), the download
   filename gets a `-partial` suffix, e.g.
   `monthly-summary-2026-07-partial.xlsx` / `.docx`, so a filtered file is
   distinguishable from the full one.

## Frontend changes (`app/overview/monthly/page.tsx`)

- Add `selectedDivisionIds: Set<string>` state.
- Reset it to "all division IDs" whenever a new month's `summary` loads
  (in the summary-load effect).
- Derive filtered KPI totals with `useMemo` from the checked set:
  - `divisions` = count of checked divisions
  - `created` / `completed` = sum over checked divisions
  - `netOpen` = created − completed
- Build `excelHref` / `wordHref` from month + selected IDs, omitting the
  `divisions` param when all are selected; set `href` to `undefined` (disabled)
  when none are selected.
- `MonthlyDivisionCard` gains `checked: boolean` and `onToggle: () => void`
  props: renders the header checkbox and applies dim styling when unchecked.
- Add the "Select all / Deselect all" + count control above the division list.

## Edge cases / testing

- **All checked** → export URL has no `divisions` param → identical output to
  today (Excel and Word).
- **Subset checked** → only those divisions appear; totals (KPIs, Excel Summary
  sheet, Word totals line) reflect the subset.
- **None checked** → export buttons disabled; direct hit to the route with an
  empty/garbage `divisions` value returns 400.
- **New month selected** → checkboxes reset to all-checked.
- Verify filtered `.xlsx` and `.docx` actually open in Excel / Word.

## Out of scope for this change

Scheduled generation, "completed within month" toggle, and any data-layer
refactor remain untouched.
