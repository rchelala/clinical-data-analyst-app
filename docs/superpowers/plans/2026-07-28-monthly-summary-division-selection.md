# Monthly Summary Division Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user check one or more divisions in the Monthly Summary UI and have the Excel/Word export populate from only the checked divisions, with the KPI cards reflecting the selection live.

**Architecture:** A single shared pure helper in `lib/monthly-summary.ts` filters an already-fetched `MonthlySummaryResponse` to a set of division IDs and recomputes totals. Both export routes call it after fetching; the frontend tracks a `Set<number>` of checked division IDs, recomputes KPI totals with `useMemo`, and appends `&divisions=...` to the export URLs (omitting it when all are checked).

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, ExcelJS, docx. No test runner is configured — verification is `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual export checks.

**Note on IDs:** `DivisionMonthlySummary.id` is a **number** (see `lib/monthly-summary.ts:132` / the `divisionId` handling). Selection state and parsing use numbers throughout.

---

## File Structure

- **Modify** `lib/monthly-summary.ts` — add `filterSummaryByDivisionIds()` pure helper (division filter + totals recompute). Lives beside `getMonthlySummaryData` so all report-shaping logic stays in one place.
- **Modify** `app/api/overview/monthly-summary/excel/route.ts` — parse `divisions` param, filter via helper, 400 on empty match, `-partial` filename when filtered.
- **Modify** `app/api/overview/monthly-summary/word/route.ts` — same wiring as Excel.
- **Modify** `app/overview/monthly/page.tsx` — selection state, KPI `useMemo`, export hrefs, select-all control, per-card checkbox + dim styling.

---

## Task 1: Shared division-filter helper

**Files:**
- Modify: `lib/monthly-summary.ts` (add exported function at end of file)

- [ ] **Step 1: Add the helper**

Append to `lib/monthly-summary.ts` (after `getMonthlySummaryData`):

```typescript
// Filters an already-fetched monthly summary down to a set of division IDs and
// recomputes totals from the surviving divisions. Shared by the Word/Excel
// export routes so selection semantics stay identical between formats.
//
// `idsParam` is the raw comma-separated `divisions` query value (or null when
// absent). When null/blank the full report is returned untouched. Non-numeric
// or unknown IDs are ignored. `isFiltered` is true only when the surviving set
// is a strict subset of the full report (used to suffix export filenames).
export function filterSummaryByDivisionIds(
  data: MonthlySummaryResponse,
  idsParam: string | null,
): { divisions: DivisionMonthlySummary[]; totals: MonthlySummaryTotals; isFiltered: boolean } {
  if (!idsParam || !idsParam.trim()) {
    return { divisions: data.divisions, totals: data.totals, isFiltered: false };
  }

  const wanted = new Set<number>(
    idsParam
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n)),
  );

  const divisions = data.divisions.filter((division) => wanted.has(division.id));

  const totals: MonthlySummaryTotals = divisions.reduce(
    (acc, division) => {
      acc.created += division.created;
      acc.completed += division.completed;
      return acc;
    },
    { divisions: divisions.length, created: 0, completed: 0, netOpen: 0 },
  );
  totals.netOpen = totals.created - totals.completed;

  return { divisions, totals, isFiltered: divisions.length !== data.divisions.length };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `lib/monthly-summary.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/monthly-summary.ts
git commit -m "feat(monthly-summary): add division-filter helper for exports"
```

---

## Task 2: Wire the Excel route to the filter

**Files:**
- Modify: `app/api/overview/monthly-summary/excel/route.ts`

- [ ] **Step 1: Import the helper**

Change the import on line 3 from:

```typescript
import { getMonthlySummaryData, formatReportDate } from "@/lib/monthly-summary";
```

to:

```typescript
import {
  getMonthlySummaryData,
  formatReportDate,
  filterSummaryByDivisionIds,
} from "@/lib/monthly-summary";
```

- [ ] **Step 2: Apply the filter inside `GET`**

In `app/api/overview/monthly-summary/excel/route.ts`, replace the body between the validation block and `const workbook = new ExcelJS.Workbook();` so it reads:

```typescript
    const data = await getMonthlySummaryData(monthParam);

    const divisionsParam = req.nextUrl.searchParams.get("divisions");
    const { divisions, isFiltered } = filterSummaryByDivisionIds(data, divisionsParam);

    if (divisionsParam && divisions.length === 0) {
      return NextResponse.json({ error: "No matching divisions selected." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    buildSummarySheet(workbook, divisions);

    const usedNames = new Set<string>(["summary"]);
    for (const division of divisions) {
      buildDivisionSheet(workbook, division, usedNames);
    }
```

(This replaces the old `const data = ...`, `buildSummarySheet(workbook, data.divisions)`, and the `for (const division of data.divisions)` loop — they now use the filtered `divisions`.)

- [ ] **Step 3: Suffix the filename when filtered**

Replace the `Content-Disposition` header line:

```typescript
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}.xlsx"`,
```

with:

```typescript
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}${isFiltered ? "-partial" : ""}.xlsx"`,
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `excel/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/overview/monthly-summary/excel/route.ts
git commit -m "feat(monthly-summary): filter Excel export by selected divisions"
```

---

## Task 3: Wire the Word route to the filter

**Files:**
- Modify: `app/api/overview/monthly-summary/word/route.ts`

- [ ] **Step 1: Import the helper**

Change the import on line 10 from:

```typescript
import { getMonthlySummaryData, monthLabel, formatReportDate } from "@/lib/monthly-summary";
```

to:

```typescript
import {
  getMonthlySummaryData,
  monthLabel,
  formatReportDate,
  filterSummaryByDivisionIds,
} from "@/lib/monthly-summary";
```

- [ ] **Step 2: Make `buildDocument` accept filtered divisions + totals**

`buildDocument` currently reads `data.divisions` and `data.totals`. Change its signature and body to take the filtered pieces directly. Replace the function signature line:

```typescript
function buildDocument(month: string, data: Awaited<ReturnType<typeof getMonthlySummaryData>>): Document {
```

with:

```typescript
function buildDocument(
  month: string,
  divisions: DivisionMonthlySummary[],
  totals: MonthlySummaryTotals,
): Document {
```

Then inside `buildDocument`, replace the `totalsParagraph(...)` call:

```typescript
    totalsParagraph(data.totals.divisions, data.totals.created, data.totals.completed, data.totals.netOpen),
```

with:

```typescript
    totalsParagraph(totals.divisions, totals.created, totals.completed, totals.netOpen),
```

and replace both `data.divisions` references (the `if (data.divisions.length === 0)` check and the `for (const division of data.divisions)` loop) with `divisions`.

- [ ] **Step 3: Add the `MonthlySummaryTotals` type import**

The `import type` on line 11 currently is:

```typescript
import type { DivisionMonthlySummary, MonthlyGroup, MonthlyTaskRow } from "@/lib/brain-types";
```

Change it to include `MonthlySummaryTotals`:

```typescript
import type {
  DivisionMonthlySummary,
  MonthlyGroup,
  MonthlyTaskRow,
  MonthlySummaryTotals,
} from "@/lib/brain-types";
```

- [ ] **Step 4: Apply the filter inside `GET`**

Replace the block from `const data = await getMonthlySummaryData(monthParam);` through `const doc = buildDocument(monthParam, data);` with:

```typescript
    const data = await getMonthlySummaryData(monthParam);

    const divisionsParam = req.nextUrl.searchParams.get("divisions");
    const { divisions, totals, isFiltered } = filterSummaryByDivisionIds(data, divisionsParam);

    if (divisionsParam && divisions.length === 0) {
      return NextResponse.json({ error: "No matching divisions selected." }, { status: 400 });
    }

    const doc = buildDocument(monthParam, divisions, totals);
```

- [ ] **Step 5: Suffix the filename when filtered**

Replace the `Content-Disposition` header line:

```typescript
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}.docx"`,
```

with:

```typescript
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}${isFiltered ? "-partial" : ""}.docx"`,
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `word/route.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/api/overview/monthly-summary/word/route.ts
git commit -m "feat(monthly-summary): filter Word export by selected divisions"
```

---

## Task 4: Frontend selection UI

**Files:**
- Modify: `app/overview/monthly/page.tsx`

- [ ] **Step 1: Add `checked` + `onToggle` to `MonthlyDivisionCard`**

Change the `MonthlyDivisionCardProps` interface:

```typescript
interface MonthlyDivisionCardProps {
  division: DivisionMonthlySummary;
  checked: boolean;
  onToggle: () => void;
}
```

Change the function signature:

```typescript
function MonthlyDivisionCard({ division, checked, onToggle }: MonthlyDivisionCardProps) {
```

In the returned JSX, apply dim styling to the root `<section>` when unchecked and add a checkbox in the header. Replace the opening `<section ...>` line:

```typescript
    <section className="rounded-lg border border-theme bg-panel shadow-panel overflow-hidden">
```

with:

```typescript
    <section
      className={`rounded-lg border border-theme bg-panel shadow-panel overflow-hidden transition-opacity ${
        checked ? "" : "opacity-50"
      }`}
    >
```

Then replace the header title block. Change:

```typescript
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-theme">
        <h3 className="text-sm font-semibold text-primary">{division.name}</h3>
```

to:

```typescript
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-theme">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-3.5 w-3.5 rounded border-theme accent-brand-500 cursor-pointer"
          />
          <h3 className="text-sm font-semibold text-primary">{division.name}</h3>
        </label>
```

- [ ] **Step 2: Add selection state to `MonthlySummaryPage`**

Directly below the existing `summaryError` state declaration (around line 143), add:

```typescript
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 3: Reset selection to "all" when a summary loads**

In the summary-load `useEffect` (the one keyed on `[selectedMonth]`), after `setSummary(json);` add a line so all divisions start checked:

```typescript
        setSummary(json);
        setSelectedDivisionIds(new Set<number>(json.divisions.map((d: DivisionMonthlySummary) => d.id)));
```

- [ ] **Step 4: Derive filtered totals + a toggle helper**

Below the existing `selectedLabel` `useMemo` (around line 213), add:

```typescript
  const filteredTotals = useMemo(() => {
    if (!summary) return null;
    const chosen = summary.divisions.filter((d) => selectedDivisionIds.has(d.id));
    const created = chosen.reduce((sum, d) => sum + d.created, 0);
    const completed = chosen.reduce((sum, d) => sum + d.completed, 0);
    return { divisions: chosen.length, created, completed, netOpen: created - completed };
  }, [summary, selectedDivisionIds]);

  const allSelected = !!summary && selectedDivisionIds.size === summary.divisions.length;
  const noneSelected = selectedDivisionIds.size === 0;

  function toggleDivision(id: number) {
    setSelectedDivisionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!summary) return;
    setSelectedDivisionIds(allSelected ? new Set<number>() : new Set(summary.divisions.map((d) => d.id)));
  }
```

- [ ] **Step 5: Build export hrefs from month + selection**

Replace the existing `excelHref` / `wordHref` lines (around lines 215-216):

```typescript
  const excelHref = selectedMonth ? `/api/overview/monthly-summary/excel?month=${selectedMonth}` : undefined;
  const wordHref = selectedMonth ? `/api/overview/monthly-summary/word?month=${selectedMonth}` : undefined;
```

with:

```typescript
  // Omit the `divisions` param when every division is selected so the "export
  // everything" URL stays identical to the pre-filter behavior. Disable exports
  // (undefined href) when nothing is selected.
  const divisionsQuery =
    summary && !allSelected && !noneSelected
      ? `&divisions=${Array.from(selectedDivisionIds).join(",")}`
      : "";
  const canExport = !!selectedMonth && !noneSelected;
  const excelHref = canExport
    ? `/api/overview/monthly-summary/excel?month=${selectedMonth}${divisionsQuery}`
    : undefined;
  const wordHref = canExport
    ? `/api/overview/monthly-summary/word?month=${selectedMonth}${divisionsQuery}`
    : undefined;
```

- [ ] **Step 6: Use filtered totals in the KPI cards + add the select-all control**

Replace the KPI grid block:

```typescript
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Divisions" value={summary.totals.divisions} icon={Building2} />
                    <KpiCard label="New" value={summary.totals.created} icon={PlusCircle} />
                    <KpiCard label="Completed" value={summary.totals.completed} icon={CheckCircle2} />
                    <KpiCard
                      label="Net open"
                      value={summary.totals.netOpen}
                      icon={TrendingUp}
                      danger={summary.totals.netOpen > 0}
                    />
                  </div>
```

with:

```typescript
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Divisions" value={filteredTotals?.divisions ?? 0} icon={Building2} />
                    <KpiCard label="New" value={filteredTotals?.created ?? 0} icon={PlusCircle} />
                    <KpiCard label="Completed" value={filteredTotals?.completed ?? 0} icon={CheckCircle2} />
                    <KpiCard
                      label="Net open"
                      value={filteredTotals?.netOpen ?? 0}
                      icon={TrendingUp}
                      danger={(filteredTotals?.netOpen ?? 0) > 0}
                    />
                  </div>
```

Then, inside the `summary.divisions.length === 0 ? (...) : (` else-branch, replace:

```typescript
                    <div className="flex flex-col gap-4">
                      {summary.divisions.map((division) => (
                        <MonthlyDivisionCard key={division.id} division={division} />
                      ))}
                    </div>
```

with:

```typescript
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={toggleAll}
                          className="text-xs font-medium text-secondary hover:text-primary transition-colors"
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                        <span className="text-[11px] text-secondary">
                          {selectedDivisionIds.size} of {summary.divisions.length} selected
                        </span>
                      </div>
                      {summary.divisions.map((division) => (
                        <MonthlyDivisionCard
                          key={division.id}
                          division={division}
                          checked={selectedDivisionIds.has(division.id)}
                          onToggle={() => toggleDivision(division.id)}
                        />
                      ))}
                    </div>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `app/overview/monthly/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add app/overview/monthly/page.tsx
git commit -m "feat(monthly-summary): division checkboxes drive KPIs and exports"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint + build**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds.

- [ ] **Step 2: Manual — all selected (unchanged behavior)**

Start `npm run dev`, open the Monthly Summary page. With all divisions checked:
- Confirm KPI cards match the full-month numbers.
- Click **Excel** and **Word**; confirm files download named `monthly-summary-YYYY-MM.xlsx` / `.docx` (no `-partial`) and open correctly with every division present.

- [ ] **Step 3: Manual — subset selected**

Uncheck one or more divisions:
- Confirm unchecked cards dim and the KPI cards drop to the checked-only totals.
- Confirm the count reads e.g. "2 of 5 selected".
- Download **Excel** and **Word**; confirm filenames end `-partial`, and the files contain only the checked divisions with totals matching the on-screen KPIs.

- [ ] **Step 4: Manual — none selected**

Click **Deselect all**:
- Confirm both export buttons are disabled (greyed, not clickable).
- Confirm the count reads "0 of N selected".

- [ ] **Step 5: Manual — month switch resets selection**

Select a different month in the archive rail:
- Confirm all divisions are checked again and KPIs show the full month.

- [ ] **Step 6: Final commit (if any lint auto-fixes applied)**

```bash
git add -A
git commit -m "chore(monthly-summary): lint/build verification for division selection" || echo "nothing to commit"
```
