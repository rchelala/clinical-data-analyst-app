"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileDown, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import type { LoadedFile } from "@/lib/pbix-parser";

interface LoadedFileWithRaw extends LoadedFile {
  rawFile: File;
}

interface Props {
  loadedFiles: LoadedFileWithRaw[];
}

type AuthState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "awaiting_code"; userCode: string; verificationUri: string; deviceCode: string; expiresAt: number }
  | { phase: "polling"; userCode: string; verificationUri: string }
  | { phase: "connected"; token: string; expiresOn: string }
  | { phase: "expired" }
  | { phase: "error"; message: string };

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

const TOKEN_CACHE_KEY = "pbi_export_token";

function getCachedToken(): { accessToken: string; expiresOn: string } | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken: string; expiresOn: string };
    // Only reuse if more than 5 minutes remain
    if (new Date(parsed.expiresOn).getTime() - Date.now() > 5 * 60 * 1000) return parsed;
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

function cacheToken(accessToken: string, expiresOn: string) {
  try {
    sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ accessToken, expiresOn }));
  } catch {
    // sessionStorage unavailable — continue without cache
  }
}

export function PbixExportPanel({ loadedFiles }: Props) {
  const [auth, setAuth] = useState<AuthState>({ phase: "idle" });
  const [selectedFile, setSelectedFile] = useState<LoadedFileWithRaw | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      phaseTimersRef.current.forEach(clearTimeout);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // Restore cached token on mount
  useEffect(() => {
    const cached = getCachedToken();
    if (cached) {
      setAuth({ phase: "connected", token: cached.accessToken, expiresOn: cached.expiresOn });
    }
  }, []);

  // When loaded files change, update selected file if needed
  useEffect(() => {
    if (loadedFiles.length === 0) {
      setSelectedFile(null);
      setSelectedPages(new Set());
      return;
    }
    const stillLoaded = selectedFile && loadedFiles.some((f) => f.fileName === selectedFile.fileName);
    if (!stillLoaded) {
      const first = loadedFiles[0];
      setSelectedFile(first);
      setSelectedPages(new Set(first.dashboard.pages.map((p) => p.internalName)));
    }
  }, [loadedFiles, selectedFile]);

  const pollForToken = useCallback((deviceCode: string, userCode: string, verificationUri: string, intervalMs: number) => {
    setAuth({ phase: "polling", userCode, verificationUri });

    const doPoll = async () => {
      try {
        const res = await fetch("/api/powerbi-auth/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode }),
        });
        const data = await res.json() as { status: string; accessToken?: string; expiresOn?: string; detail?: string };

        if (data.status === "success" && data.accessToken && data.expiresOn) {
          cacheToken(data.accessToken, data.expiresOn);
          setAuth({ phase: "connected", token: data.accessToken, expiresOn: data.expiresOn });
          return;
        }
        if (data.status === "expired") {
          setAuth({ phase: "expired" });
          return;
        }
        if (data.status === "declined") {
          setAuth({ phase: "error", message: "Sign-in was cancelled or denied." });
          return;
        }
        if (data.status === "error") {
          setAuth({ phase: "error", message: data.detail ?? "Authentication failed." });
          return;
        }
        // "pending" or "slow_down" — keep polling
        pollTimerRef.current = setTimeout(doPoll, intervalMs);
      } catch {
        pollTimerRef.current = setTimeout(doPoll, intervalMs);
      }
    };

    pollTimerRef.current = setTimeout(doPoll, intervalMs);
  }, []);

  const startSignIn = useCallback(async () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setAuth({ phase: "starting" });

    try {
      const res = await fetch("/api/powerbi-auth/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sign-in.");
      const data = await res.json() as {
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        expiresIn: number;
        interval: number;
      };

      const expiresAt = Date.now() + data.expiresIn * 1000;
      setAuth({
        phase: "awaiting_code",
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        deviceCode: data.deviceCode,
        expiresAt,
      });

      // Begin polling after user has had a moment to open the browser
      pollForToken(data.deviceCode, data.userCode, data.verificationUri, data.interval * 1000);
    } catch (err: unknown) {
      const error = err as Error;
      setAuth({ phase: "error", message: error.message || "Could not start sign-in." });
    }
  }, [pollForToken]);

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

    // Re-sign-in if token is nearly expired
    let token = auth.token;
    if (Date.now() >= new Date(auth.expiresOn).getTime() - 5 * 60 * 1000) {
      setAuth({ phase: "expired" });
      return;
    }

    setExportError(null);
    setExportPhase("uploading");

    try {
      const form = new FormData();
      form.append("file", selectedFile.rawFile);
      form.append("pages", JSON.stringify([...selectedPages]));
      form.append("token", token);

      phaseTimersRef.current = [
        setTimeout(() => setExportPhase("importing"), 3000),
        setTimeout(() => setExportPhase("exporting"), 8000),
        setTimeout(() => setExportPhase("downloading"), 30000),
      ];

      let res: Response;
      try {
        res = await fetch("/api/powerbi-export", { method: "POST", body: form });
      } catch (networkErr: unknown) {
        phaseTimersRef.current.forEach(clearTimeout);
        phaseTimersRef.current = [];
        const error = networkErr as Error;
        setExportPhase("failed");
        setExportError(error.message || "Network error — could not reach the export server");
        return;
      }

      phaseTimersRef.current.forEach(clearTimeout);
      phaseTimersRef.current = [];

      if (!res.ok) {
        let detail = `Export failed (HTTP ${res.status})`;
        try {
          const err = await res.json() as { detail?: string; error?: string };
          detail = err.detail ?? err.error ?? detail;
        } catch {
          const text = await res.text().catch(() => "");
          if (text) detail = text;
        }
        if (res.status === 413) detail = "File too large to upload — try a smaller .pbix file";
        throw new Error(detail);
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
      const revokeTimer = setTimeout(() => URL.revokeObjectURL(url), 2000);
      phaseTimersRef.current = [revokeTimer];

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

      {/* Auth: idle — show sign in button */}
      {auth.phase === "idle" && (
        <button
          onClick={startSignIn}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-theme bg-panel text-primary hover:bg-secondary transition-colors mb-3"
        >
          Sign in with Microsoft
        </button>
      )}

      {/* Auth: starting */}
      {auth.phase === "starting" && (
        <div className="flex items-center gap-2 text-xs text-secondary mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Starting sign-in…
        </div>
      )}

      {/* Auth: awaiting code or polling */}
      {(auth.phase === "awaiting_code" || auth.phase === "polling") && (
        <div className="rounded-lg border border-theme bg-secondary p-3 mb-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-primary mb-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Sign in to Power BI
          </div>
          <p className="text-secondary mb-2">
            1. Open the link below and enter this code:
          </p>
          <div className="font-mono text-lg font-bold text-primary tracking-widest mb-2">
            {auth.userCode}
          </div>
          <a
            href={auth.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            {auth.verificationUri}
            <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-secondary mt-2">
            2. Sign in with your work account — this page will update automatically.
          </p>
        </div>
      )}

      {/* Auth: connected */}
      {auth.phase === "connected" && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected to Power BI
        </div>
      )}

      {/* Auth: expired */}
      {auth.phase === "expired" && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Session expired
          </div>
          <p className="mb-2">Your Power BI session has expired. Please sign in again.</p>
          <button onClick={startSignIn} className="underline">
            Sign in again
          </button>
        </div>
      )}

      {/* Auth: error */}
      {auth.phase === "error" && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Sign-in failed
          </div>
          <p className="mb-2 font-mono break-all">{auth.message}</p>
          <button onClick={startSignIn} className="underline">
            Try again
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
          {(() => {
            const stepIdx = EXPORT_STEPS.findIndex((s) => s.phase === exportPhase);
            return EXPORT_STEPS.map(({ phase, label }, thisIdx) => {
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
            });
          })()}
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

      {/* Export error */}
      {exportPhase === "failed" && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 mb-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Export failed
          </div>
          <p className="font-mono break-all">{exportError ?? "An unexpected error occurred"}</p>
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
