"use client";

import { useState, useCallback } from "react";
import { FileDown, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import type { LoadedFile } from "@/lib/pbix-parser";
import { parsePbrsPortalUrl, buildPbrsExportUrl } from "@/lib/powerbi-export-client";

interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}

interface Props {
  loadedFiles: LoadedFileWithRaw[];
}

export function PbixExportPanel({ loadedFiles }: Props) {
  void loadedFiles;

  const [urlInput, setUrlInput] = useState("");
  const [exportState, setExportState] = useState<"idle" | "done" | "failed">("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const parsed = parsePbrsPortalUrl(urlInput);

  const handleExport = useCallback(() => {
    if (!parsed) return;
    setExportError(null);
    try {
      const exportUrl = buildPbrsExportUrl(parsed.serverBase, parsed.reportPath);
      const a = document.createElement("a");
      a.href = exportUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportState("done");
    } catch (err: unknown) {
      const error = err as Error;
      setExportState("failed");
      setExportError(error.message || "Export failed");
    }
  }, [parsed]);

  const handleReset = useCallback(() => {
    setExportState("idle");
    setExportError(null);
  }, []);

  return (
    <div className="border-t border-theme px-6 py-4 flex-shrink-0">
      <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
        <FileDown className="w-4 h-4" />
        Export to PDF
      </h3>

      {exportState === "idle" && (
        <>
          <div className="mb-3">
            <label className="text-xs text-secondary block mb-1">
              Report URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://tpdcpbi02/reports/powerbi/Folder/ReportName"
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {urlInput.length > 0 && (
              <p className={`mt-1 text-xs ${parsed ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                {parsed
                  ? `↳ ${parsed.reportPath}`
                  : "Could not parse a report path from this URL"}
              </p>
            )}
          </div>

          {(parsed?.serverBase || urlInput.length === 0) && (
            <div className="mb-3">
              <a
                href={parsed ? `${parsed.serverBase}/reports/browse` : "http://tpdcpbi02/reports/browse"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                Open Report Server portal
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={!parsed}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export as PDF
          </button>
        </>
      )}

      {exportState === "done" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PDF opened in new tab
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            Export another
          </button>
        </div>
      )}

      {exportState === "failed" && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Export failed
          </div>
          <p className="font-mono break-all">{exportError ?? "An unexpected error occurred"}</p>
          <button onClick={handleReset} className="mt-2 underline">Try again</button>
        </div>
      )}
    </div>
  );
}
