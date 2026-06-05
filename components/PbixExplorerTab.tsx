"use client";

import { useState, useCallback, useMemo } from "react";
import { Upload, X, FileBarChart2, AlertCircle, Search, Loader2 } from "lucide-react";
import { parsePbixFileClient } from "@/lib/pbix-parser-browser";
import type { PbixDashboard, LoadedFile } from "@/lib/pbix-parser";
import { PbixMeasuresView } from "@/components/PbixMeasuresView";

interface FileError {
  name: string;
}

interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}

interface VisualRow {
  title: string;
  type: string;
  page: string;
  file: string;
}

export function PbixExplorerTab() {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFileWithRaw[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchType, setSearchType] = useState("");
  const [selectedPage, setSelectedPage] = useState("");
  const [view, setView] = useState<"visuals" | "measures">("visuals");

  const processFiles = useCallback(async (files: File[]) => {
    const fileArray = files.filter((f) => f.name.toLowerCase().endsWith(".pbix"));
    const newFiles: LoadedFileWithRaw[] = [];
    const newErrors: FileError[] = [];

    setIsProcessing(true);
    try {
      for (const file of fileArray) {
        try {
          const dashboard = await parsePbixFileClient(file);
          newFiles.push({ dashboard, fileName: file.name, rawFile: file });
        } catch {
          newErrors.push({ name: file.name });
        }
      }

      setLoadedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.fileName));
        return [...prev, ...newFiles.filter((r) => !existingNames.has(r.fileName))];
      });
      setFileErrors((prev) => {
        const existingNames = new Set(prev.map((e) => e.name));
        return [...prev, ...newErrors.filter((e) => !existingNames.has(e.name))];
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
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
      if (e.target.files) processFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [processFiles]
  );

  const removeFile = useCallback((fileName: string) => {
    setLoadedFiles((prev) => {
      const remaining = prev.filter((f) => f.fileName !== fileName);
      const remainingTypes = new Set(
        remaining.flatMap((f) => f.dashboard.pages.flatMap((p) => p.visuals.map((v) => v.type)))
      );
      setSearchType((currentType) => (remainingTypes.has(currentType) ? currentType : ""));
      return remaining;
    });
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

  const totalPageCount = useMemo(
    () => new Set(allRows.map((r) => r.page)).size,
    [allRows]
  );

  // Final rows — all three filters applied
  const filteredRows = useMemo(
    () => titleTypeFiltered.filter((r) => selectedPage === "" || r.page === selectedPage),
    [titleTypeFiltered, selectedPage]
  );

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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredRows]);

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
            isProcessing
              ? "pointer-events-none opacity-60 border-theme bg-secondary"
              : isDragging
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
              : "border-theme hover:border-brand-400 bg-secondary"
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-6 h-6 text-secondary animate-spin" />
              <p className="text-sm text-secondary">Parsing files…</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-secondary" />
              <div className="text-center">
                <p className="text-sm font-medium text-primary">Drop .pbix files here</p>
                <p className="text-xs text-secondary mt-0.5">or click to browse — multiple files supported</p>
              </div>
            </>
          )}
        </div>
        <input
          id="pbix-file-input"
          type="file"
          accept=".pbix"
          multiple
          className="hidden"
          disabled={isProcessing}
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

      {/* View toggle */}
      <div className="flex gap-1 px-6 pb-3 flex-shrink-0">
        <button
          onClick={() => setView("visuals")}
          className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
            view === "visuals"
              ? "bg-brand-600 text-white"
              : "bg-panel border border-theme text-secondary hover:text-primary"
          }`}
        >
          Visuals
        </button>
        <button
          onClick={() => setView("measures")}
          className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
            view === "measures"
              ? "bg-brand-600 text-white"
              : "bg-panel border border-theme text-secondary hover:text-primary"
          }`}
        >
          Measures
        </button>
      </div>

      {view === "visuals" ? (
        <>
          {/* Search row */}
          <div className="flex gap-3 px-6 pb-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary pointer-events-none" />
              <input
                type="text"
                value={searchTitle}
                onChange={(e) => { setSearchTitle(e.target.value); setSelectedPage(""); }}
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
                    <tr key={`${row.file}|${row.page}|${row.type}|${row.title}|${i}`} className="border-b border-theme hover:bg-panel transition-colors">
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

          {/* Footer */}
          {loadedFiles.length > 0 && (
            <div className="flex items-center justify-between px-6 py-2 border-t border-theme bg-panel text-xs text-secondary flex-shrink-0">
              <span>
                Showing {filteredRows.length} of {allRows.length} visuals across {loadedFiles.length}{" "}
                {loadedFiles.length === 1 ? "file" : "files"}, {totalPageCount}{" "}
                {totalPageCount === 1 ? "page" : "pages"}
              </span>
              <button
                onClick={handleCsvExport}
                className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Copy results as CSV
              </button>
            </div>
          )}
        </>
      ) : (
        <PbixMeasuresView loadedFiles={loadedFiles} />
      )}
    </div>
  );
}
