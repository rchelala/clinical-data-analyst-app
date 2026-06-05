"use client";

import { useState, useEffect, useCallback } from "react";
import { FileDown, CheckCircle2, AlertCircle, Loader2, Terminal } from "lucide-react";
import type { LoadedFile } from "@/lib/pbix-parser";

interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}

interface Props {
  loadedFiles: LoadedFileWithRaw[];
}

type AuthState =
  | { phase: "connecting" }
  | { phase: "connected"; token: string; expiresOn: string }
  | { phase: "error"; code: "azure_cli_not_found" | "not_logged_in" | "unknown"; detail?: string };

type ExportPhase =
  | "idle"
  | "uploading"
  | "importing"
  | "exporting"
  | "downloading"
  | "cleaning_up"
  | "done"
  | "failed";

const EXPORT_STEPS: { phase: ExportPhase; label: string }[] = [
  { phase: "uploading", label: "Uploading to Power BI…" },
  { phase: "importing", label: "Processing import…" },
  { phase: "exporting", label: "Generating PDF…" },
  { phase: "downloading", label: "Downloading…" },
  { phase: "cleaning_up", label: "Cleaning up…" },
];

async function fetchToken(): Promise<{ accessToken: string; expiresOn: string }> {
  const res = await fetch("/api/powerbi-token");
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw Object.assign(new Error("token_error"), { code: data.error ?? "unknown" });
  }
  return res.json();
}

export function PbixExportPanel({ loadedFiles }: Props) {
  const [auth, setAuth] = useState<AuthState>({ phase: "connecting" });
  const [selectedFile, setSelectedFile] = useState<LoadedFileWithRaw | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setAuth({ phase: "connecting" });
    try {
      const { accessToken, expiresOn } = await fetchToken();
      setAuth({ phase: "connected", token: accessToken, expiresOn });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      const code = error.code ?? "unknown";
      setAuth({
        phase: "error",
        code: code as "azure_cli_not_found" | "not_logged_in" | "unknown",
        detail: error.message,
      });
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // When loaded files change, update selected file if needed
  useEffect(() => {
    if (loadedFiles.length === 0) {
      setSelectedFile(null);
      setSelectedPages(new Set());
      return;
    }
    const current = selectedFile;
    const stillLoaded = current && loadedFiles.some((f) => f.fileName === current.fileName);
    if (!stillLoaded) {
      const first = loadedFiles[0];
      setSelectedFile(first);
      setSelectedPages(new Set(first.dashboard.pages.map((p) => p.internalName)));
    }
  }, [loadedFiles, selectedFile]);

  // Auto-refresh token 5 min before expiry
  useEffect(() => {
    if (auth.phase !== "connected") return;
    const expiresMs = new Date(auth.expiresOn).getTime();
    const refreshAt = expiresMs - 5 * 60 * 1000;
    const delay = refreshAt - Date.now();
    if (delay <= 0) {
      connect();
      return;
    }
    const timer = setTimeout(connect, delay);
    return () => clearTimeout(timer);
  }, [auth, connect]);

  const togglePage = useCallback((internalName: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(internalName)) next.delete(internalName);
      else next.add(internalName);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!selectedFile) return;
    setSelectedPages(new Set(selectedFile.dashboard.pages.map((p) => p.internalName)));
  }, [selectedFile]);

  const clearAll = useCallback(() => setSelectedPages(new Set()), []);

  const handleExport = useCallback(async () => {
    if (auth.phase !== "connected" || !selectedFile || selectedPages.size === 0) return;

    // Refresh token if nearly expired
    let token = auth.token;
    if (Date.now() >= new Date(auth.expiresOn).getTime() - 5 * 60 * 1000) {
      try {
        const fresh = await fetchToken();
        token = fresh.accessToken;
        setAuth({ phase: "connected", token: fresh.accessToken, expiresOn: fresh.expiresOn });
      } catch {
        setAuth({ phase: "error", code: "not_logged_in" });
        return;
      }
    }

    setExportError(null);
    setExportPhase("uploading");

    try {
      const form = new FormData();
      form.append("file", selectedFile.rawFile);
      form.append("pages", JSON.stringify([...selectedPages]));
      form.append("token", token);

      // Simulate phase progression while server handles all steps
      const phaseTimers: ReturnType<typeof setTimeout>[] = [
        setTimeout(() => setExportPhase("importing"), 3000),
        setTimeout(() => setExportPhase("exporting"), 8000),
        setTimeout(() => setExportPhase("downloading"), 30000),
      ];

      let res: Response;
      try {
        res = await fetch("/api/powerbi-export", { method: "POST", body: form });
      } catch (networkErr: unknown) {
        phaseTimers.forEach(clearTimeout);
        const error = networkErr as Error;
        setExportPhase("failed");
        setExportError(error.message || "Network error — could not reach the export server");
        return;
      }

      phaseTimers.forEach(clearTimeout);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? err.error ?? "Export failed");
      }

      setExportPhase("cleaning_up");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedFile.dashboard.reportName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setExportPhase("done");
    } catch (err: unknown) {
      const error = err as Error;
      setExportPhase("failed");
      setExportError(error.message || "Export failed");
    }
  }, [auth, selectedFile, selectedPages]);

  if (loadedFiles.length === 0) return null;

  return (
    <div className="border-t border-theme px-6 py-4 flex-shrink-0">
      <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
        <FileDown className="w-4 h-4" />
        Export to PDF
      </h3>

      {/* Auth status */}
      {auth.phase === "connecting" && (
        <div className="flex items-center gap-2 text-xs text-secondary mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Connecting to Power BI…
        </div>
      )}

      {auth.phase === "connected" && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected to Power BI
        </div>
      )}

      {auth.phase === "error" && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {auth.code === "azure_cli_not_found" ? "Azure CLI not found" : "Not logged in to Azure"}
          </div>
          {auth.code === "azure_cli_not_found" ? (
            <div className="space-y-1">
              <p>Install Azure CLI, then log in with your work account:</p>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                winget install Microsoft.AzureCLI
              </code>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                az login
              </code>
            </div>
          ) : (
            <div className="space-y-1">
              <p>Run this once in a terminal to authenticate:</p>
              <code className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 font-mono">
                <Terminal className="w-3 h-3 shrink-0" />
                az login
              </code>
            </div>
          )}
          <button
            onClick={connect}
            className="mt-2 text-amber-700 dark:text-amber-400 underline text-xs"
          >
            Retry connection
          </button>
        </div>
      )}

      {/* File selector (multiple files) */}
      {loadedFiles.length > 1 && (
        <div className="mb-3">
          <label className="text-xs text-secondary block mb-1">File to export</label>
          <select
            value={selectedFile?.fileName ?? ""}
            onChange={(e) => {
              const f = loadedFiles.find((lf) => lf.fileName === e.target.value) ?? null;
              setSelectedFile(f);
              if (f) setSelectedPages(new Set(f.dashboard.pages.map((p) => p.internalName)));
            }}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-theme bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {loadedFiles.map((f) => (
              <option key={f.fileName} value={f.fileName}>
                {f.dashboard.reportName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Page selection */}
      {auth.phase === "connected" && selectedFile && exportPhase === "idle" && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-secondary">Pages to include</label>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-brand-600 dark:text-brand-400 hover:underline">
                Select all
              </button>
              <span className="text-secondary">·</span>
              <button onClick={clearAll} className="text-brand-600 dark:text-brand-400 hover:underline">
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectedFile.dashboard.pages.map((page) => (
              <label
                key={page.internalName}
                className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:text-brand-600 dark:hover:text-brand-400"
              >
                <input
                  type="checkbox"
                  checked={selectedPages.has(page.internalName)}
                  onChange={() => togglePage(page.internalName)}
                  className="rounded border-theme accent-brand-600"
                />
                {page.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Export progress */}
      {exportPhase !== "idle" && exportPhase !== "done" && exportPhase !== "failed" && (
        <div className="space-y-1.5 mb-3">
          {EXPORT_STEPS.map(({ phase, label }) => {
            const stepIdx = EXPORT_STEPS.findIndex((s) => s.phase === exportPhase);
            const thisIdx = EXPORT_STEPS.findIndex((s) => s.phase === phase);
            const isDone = thisIdx < stepIdx;
            const isActive = phase === exportPhase;
            return (
              <div key={phase} className={`flex items-center gap-2 text-xs ${isDone ? "text-emerald-600 dark:text-emerald-400" : isActive ? "text-primary font-medium" : "text-slate-400"}`}>
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                ) : (
                  <div className="w-3.5 h-3.5 shrink-0 rounded-full border border-current opacity-30" />
                )}
                {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Done state */}
      {exportPhase === "done" && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PDF downloaded
          </div>
          <button
            onClick={() => setExportPhase("idle")}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            Export another
          </button>
        </div>
      )}

      {/* Error state */}
      {exportPhase === "failed" && exportError !== null && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 mb-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Export failed
          </div>
          <p className="font-mono break-all">{exportError}</p>
          <button
            onClick={() => { setExportPhase("idle"); setExportError(null); }}
            className="mt-2 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Export button */}
      {auth.phase === "connected" && exportPhase === "idle" && (
        <button
          onClick={handleExport}
          disabled={selectedPages.size === 0 || !selectedFile}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Export {selectedPages.size} {selectedPages.size === 1 ? "page" : "pages"} as PDF
        </button>
      )}
    </div>
  );
}