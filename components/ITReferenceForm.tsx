"use client";

import { useState, useCallback } from "react";
import { FileText, Loader2, Download, AlertCircle, RotateCcw } from "lucide-react";
import { AIProvider } from "@/lib/providers";

interface ITReferenceFormProps {
  provider: AIProvider;
}

export function ITReferenceForm({ provider: _provider }: ITReferenceFormProps) {
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("IT_Reference.docx");

  const handleGenerate = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const res = await fetch("/api/it-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      setFileName(nameMatch ? nameMatch[1] : "IT_Reference.docx");
      setDownloadUrl(url);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [sql, downloadUrl]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    a.click();
  }, [downloadUrl, fileName]);

  const handleReset = useCallback(() => {
    setSql("");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }, [downloadUrl]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-3 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-secondary" />
          <span className="text-sm font-semibold text-primary">IT Reference Page Generator</span>
          <span className="text-xs text-secondary hidden sm:inline">— paste a SQL Server view or stored procedure</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {sql && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          {downloadUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Download .docx
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={!sql.trim() || loading}
            className="btn-shimmer flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 transition-all duration-200"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
            ) : (
              <><FileText className="w-4 h-4" />Generate IT Reference</>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-red-500/10 border-b border-red-500/30 animate-fade-in flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Success banner */}
      {downloadUrl && !error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500/10 border-b border-emerald-500/30 animate-fade-in flex-shrink-0">
          <Download className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-400">
            <strong>{fileName}</strong> is ready — click <strong>Download .docx</strong> above.
          </p>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* SQL input */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-theme bg-secondary flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${sql ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-secondary/40"}`} />
              <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
                SQL · View or Stored Procedure
              </span>
            </div>
            {sql && (
              <span className="text-xs text-secondary">
                {sql.split("\n").length} lines
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto bg-panel p-0 relative">
            {!sql && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none px-8 text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary border border-theme">
                  <FileText className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-secondary">Paste your SQL here</p>
                  <p className="text-xs text-secondary/70 mt-1">
                    Any <strong className="text-secondary">CREATE/ALTER VIEW</strong> or <strong className="text-secondary">CREATE/ALTER PROCEDURE</strong> will work.
                    Claude will extract the header, data sources, and all referenced tables automatically.
                  </p>
                </div>
              </div>
            )}
            <textarea
              value={sql}
              onChange={(e) => {
                setSql(e.target.value);
                if (downloadUrl) {
                  URL.revokeObjectURL(downloadUrl);
                  setDownloadUrl(null);
                }
                setError(null);
              }}
              spellCheck={false}
              className="w-full h-full min-h-full resize-none bg-transparent font-mono text-sm text-primary p-4 focus:outline-none"
              placeholder=""
            />
          </div>
        </div>

        {/* Info panel */}
        <div className="w-72 flex-shrink-0 border-l border-theme bg-secondary overflow-y-auto">
          <div className="p-4 border-b border-theme">
            <h3 className="text-[10.5px] font-semibold text-secondary uppercase tracking-wide mb-3">What gets extracted</h3>
            <ul className="space-y-2.5 text-xs">
              {[
                ["Dashboard Header", "Name, dates, requestor, stakeholder, refresh cadence"],
                ["Data Sources", "View/SP name, cube, patient population, look-back period, notes, orders"],
                ["Database Tables", "All FROM/JOIN tables grouped by database, de-duplicated"],
              ].map(([title, desc]) => (
                <li key={title} className="flex flex-col gap-0.5">
                  <span className="font-semibold text-primary text-[12.5px]">{title}</span>
                  <span className="text-secondary leading-relaxed">{desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 border-b border-theme">
            <h3 className="text-[10.5px] font-semibold text-secondary uppercase tracking-wide mb-3">Output format</h3>
            <ul className="space-y-0.5 text-xs text-secondary">
              {[
                "Word document (.docx)",
                "US Letter, Arial font",
                "Blue section headers",
                "Purple dashboard title",
                "Striped table rows",
                "Gray italic placeholders for missing fields",
              ].map((item) => (
                <li key={item} className="relative pl-3.5 py-0.5 before:content-['•'] before:absolute before:left-0 before:text-brand-400">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4">
            <h3 className="text-[10.5px] font-semibold text-secondary uppercase tracking-wide mb-2">Tip</h3>
            <p className="text-xs text-secondary leading-relaxed">
              Include revision history comments at the top of your SQL — they&apos;re used to fill in Created date, Updated date, Requestor, and Stakeholder automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
