"use client";

import { useState, useMemo, useCallback } from "react";
import { Search } from "lucide-react";
import type { PbixDashboard, MeasureUsage } from "@/lib/pbix-parser";

interface LoadedFile {
  dashboard: PbixDashboard;
  fileName: string;
}

interface FlatMeasureRow {
  name: string;
  table: string;
  file: string;
  usages: MeasureUsage[];
}

interface PbixMeasuresViewProps {
  loadedFiles: LoadedFile[];
}

function formatVisuals(usages: MeasureUsage[]): string {
  const titles = [...new Set(usages.map((u) => u.visualTitle || u.visualType))];
  if (titles.length === 0) return "—";
  if (titles.length <= 2) return titles.join(", ");
  return `${titles.slice(0, 2).join(", ")}, +${titles.length - 2} more`;
}

function formatPages(usages: MeasureUsage[]): string {
  const pages = [...new Set(usages.map((u) => u.page))];
  return pages.length > 0 ? pages.join(", ") : "—";
}

export function PbixMeasuresView({ loadedFiles }: PbixMeasuresViewProps) {
  const [measureSearch, setMeasureSearch] = useState("");
  const [measureFilter, setMeasureFilter] = useState<"all" | "used" | "unused">("all");

  const showFileColumn = loadedFiles.length > 1;
  const modelMeasuresUnavailable = loadedFiles.some(
    (f) => !f.dashboard.modelMeasuresAvailable
  );

  const allMeasureRows = useMemo<FlatMeasureRow[]>(
    () =>
      loadedFiles.flatMap((f) =>
        f.dashboard.measures.map((m) => ({
          name: m.name,
          table: m.table,
          file: f.dashboard.reportName,
          usages: m.usages,
        }))
      ),
    [loadedFiles]
  );

  const filteredRows = useMemo(
    () =>
      allMeasureRows
        .filter((r) => r.name.toLowerCase().includes(measureSearch.toLowerCase()))
        .filter((r) =>
          measureFilter === "all"
            ? true
            : measureFilter === "used"
            ? r.usages.length > 0
            : r.usages.length === 0
        ),
    [allMeasureRows, measureSearch, measureFilter]
  );

  const usedCount = useMemo(
    () => allMeasureRows.filter((r) => r.usages.length > 0).length,
    [allMeasureRows]
  );

  const handleCsvExport = useCallback(() => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const headers = ["Measure Name", "Table", "Pages", "Visuals", "Status"];
    if (showFileColumn) headers.push("File");
    const header = headers.map(escape).join(",");
    const rows = filteredRows.map((r) => {
      const pages = [...new Set(r.usages.map((u) => u.page))].join(";");
      const visuals = [...new Set(r.usages.map((u) => u.visualTitle || u.visualType))].join(";");
      const status = r.usages.length > 0 ? "Used" : "Unused";
      const cols = [r.name, r.table, pages, visuals, status];
      if (showFileColumn) cols.push(r.file);
      return cols.map(escape).join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pbix-measures.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredRows, showFileColumn]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Data availability notice */}
      {modelMeasuresUnavailable && allMeasureRows.length > 0 && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
          Showing only measures referenced in visuals — the DataModel format in one or more files is not readable.
        </div>
      )}

      {/* Search row */}
      <div className="flex gap-3 px-6 pb-3 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary pointer-events-none" />
          <input
            type="text"
            value={measureSearch}
            onChange={(e) => setMeasureSearch(e.target.value)}
            placeholder="Search measure name…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-theme text-sm">
          {(["all", "used", "unused"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setMeasureFilter(f)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                measureFilter === f
                  ? "bg-brand-600 text-white"
                  : "bg-panel text-secondary hover:text-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto px-6">
        {loadedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-secondary">
            <Search className="w-10 h-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium">Drop a .pbix file above to get started</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-secondary">
            <Search className="w-8 h-8 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium">No measures match your search</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-theme text-xs text-secondary uppercase tracking-wide">
                <th className="text-left py-2 px-2 font-semibold">Measure Name</th>
                <th className="text-left py-2 px-2 font-semibold">Table</th>
                <th className="text-left py-2 px-2 font-semibold">Pages</th>
                <th className="text-left py-2 px-2 font-semibold">Visuals</th>
                {showFileColumn && <th className="text-left py-2 px-2 font-semibold">File</th>}
                <th className="text-left py-2 px-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr
                  key={`${row.file}|${row.table}|${row.name}|${i}`}
                  className="border-b border-theme hover:bg-panel transition-colors"
                >
                  <td className="py-2 px-2 font-medium text-primary">{row.name}</td>
                  <td className="py-2 px-2 text-secondary">{row.table}</td>
                  <td className="py-2 px-2 text-secondary">{formatPages(row.usages)}</td>
                  <td className="py-2 px-2 text-secondary">{formatVisuals(row.usages)}</td>
                  {showFileColumn && <td className="py-2 px-2 text-secondary">{row.file}</td>}
                  <td className="py-2 px-2">
                    {row.usages.length > 0 ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">● Used</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">○ Unused</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {loadedFiles.length > 0 && (
        <div className="flex items-center justify-between px-6 py-2 border-t border-theme bg-panel text-xs text-secondary flex-shrink-0">
          <span>
            {allMeasureRows.length} measures · {usedCount} used · {allMeasureRows.length - usedCount} unused
          </span>
          <button
            onClick={handleCsvExport}
            className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
          >
            Copy as CSV
          </button>
        </div>
      )}
    </div>
  );
}
