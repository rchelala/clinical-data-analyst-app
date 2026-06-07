// components/DashboardCaptureTab.tsx
"use client";

import { useState, useEffect } from "react";
import { Camera, Loader2, Download, CheckSquare, Square, AlertCircle, CheckCircle2, Terminal } from "lucide-react";
import { parsePbrsPortalUrl } from "@/lib/powerbi-export-client";

type CaptureState = "idle" | "loading-pages" | "pages-ready" | "capturing" | "done";
type SetupStatus = "checking" | "ready" | "needs-chromium";

export function DashboardCaptureTab() {
  const [url, setUrl]           = useState("");
  const [state, setState]       = useState<CaptureState>("idle");
  const [pages, setPages]       = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError]       = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("checking");
  const [openingTerminal, setOpeningTerminal] = useState(false);

  useEffect(() => {
    fetch("/api/capture/status")
      .then((r) => r.json() as Promise<{ chromiumInstalled: boolean }>)
      .then((data) => setSetupStatus(data.chromiumInstalled ? "ready" : "needs-chromium"))
      .catch(() => setSetupStatus("needs-chromium"));
  }, []);

  const validUrl = url.trim().length > 0 && parsePbrsPortalUrl(url.trim()) !== null;

  function resetForNewUrl() {
    setState("idle");
    setPages([]);
    setSelected(new Set());
    setError(null);
  }

  async function handleLoadPages() {
    if (!validUrl) return;
    setState("loading-pages");
    setError(null);
    setPages([]);
    setSelected(new Set());

    try {
      const res = await fetch(`/api/capture/pages?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json() as { pages?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load pages");
        setState("idle");
        return;
      }
      const found = data.pages ?? [];
      setPages(found);
      setSelected(new Set(found));
      setState(found.length > 0 ? "pages-ready" : "idle");
      if (found.length === 0) setError("No pages detected — the report may still be loading, or the page tab selector needs adjustment for your PBRS version.");
    } catch {
      setError("Network error — make sure the app is running locally (npm run dev).");
      setState("idle");
    }
  }

  async function handleCapture() {
    const pageList = pages.filter((p) => selected.has(p));
    if (pageList.length === 0) return;
    setState("capturing");
    setError(null);

    try {
      const res = await fetch("/api/capture/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), pages: pageList }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Capture failed");
        setState("pages-ready");
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "dashboard-pages.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      setState("done");
    } catch {
      setError("Network error during capture.");
      setState("pages-ready");
    }
  }

  function togglePage(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => prev.size === pages.length ? new Set() : new Set(pages));
  }

  async function handleOpenTerminal() {
    setOpeningTerminal(true);
    setError(null);
    try {
      const res = await fetch("/api/capture/open-terminal", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to open terminal.");
      }
    } catch {
      setError("Network error — could not open terminal.");
    } finally {
      setOpeningTerminal(false);
    }
  }

  async function handleCheckAgain() {
    setSetupStatus("checking");
    try {
      const res = await fetch("/api/capture/status");
      if (!res.ok) { setSetupStatus("needs-chromium"); return; }
      const data = await res.json() as { chromiumInstalled: boolean };
      setSetupStatus(data.chromiumInstalled ? "ready" : "needs-chromium");
    } catch {
      setSetupStatus("needs-chromium");
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto p-6 bg-primary">
      <div className="max-w-2xl mx-auto w-full space-y-6">

        {/* Setup checklist */}
        {setupStatus === "ready" ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 dark:text-green-400 font-medium">Setup complete</span>
          </div>
        ) : (
          <div className="rounded-lg border border-theme bg-panel divide-y divide-theme">
            {/* Row 1: Playwright Chromium */}
            <div className="flex items-center gap-3 px-4 py-3">
              {setupStatus === "checking" ? (
                <Loader2 className="w-4 h-4 animate-spin text-secondary flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-amber-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">
                  {setupStatus === "checking" ? "Checking Playwright Chromium…" : "Playwright Chromium not installed"}
                </p>
                {setupStatus === "needs-chromium" && (
                  <p className="text-xs text-secondary mt-0.5">Required for headless browser screenshots</p>
                )}
              </div>
              {setupStatus === "needs-chromium" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleCheckAgain}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Check again
                  </button>
                  <button
                    onClick={handleOpenTerminal}
                    disabled={openingTerminal}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {openingTerminal ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />Opening…</>
                    ) : (
                      <><Terminal className="w-3 h-3" />Open PowerShell</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Dev server */}
            <div className="flex items-center gap-3 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-primary">Dev server running</p>
            </div>
          </div>
        )}

        {/* URL input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">PBRS Report URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); resetForNewUrl(); }}
              placeholder="http://tpdcpbi02/reports/powerbi/Folder/ReportName"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-theme bg-panel text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={handleLoadPages}
              disabled={!validUrl || state === "loading-pages" || state === "capturing"}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state === "loading-pages" ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Opening…</>
              ) : (
                <><Camera className="w-4 h-4" />Load Pages</>
              )}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Page list */}
        {pages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-primary">{pages.length} pages found</span>
              <button onClick={toggleAll} className="text-xs text-brand-600 hover:underline">
                {selected.size === pages.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="rounded-lg border border-theme bg-panel divide-y divide-theme">
              {pages.map((name) => (
                <button
                  key={name}
                  onClick={() => togglePage(name)}
                  disabled={state === "capturing"}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed transition-colors"
                >
                  {selected.has(name)
                    ? <CheckSquare className="w-4 h-4 text-brand-600 flex-shrink-0" />
                    : <Square className="w-4 h-4 text-secondary flex-shrink-0" />
                  }
                  <span className="text-primary">{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Capture button */}
        {state === "pages-ready" && (
          <button
            onClick={handleCapture}
            disabled={selected.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Camera className="w-4 h-4" />
            Capture {selected.size} page{selected.size !== 1 ? "s" : ""}
          </button>
        )}

        {/* Capturing indicator */}
        {state === "capturing" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-theme bg-panel">
            <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
            <span className="text-sm text-secondary">
              Capturing pages… this may take a minute while the report renders.
            </span>
          </div>
        )}

        {/* Done state */}
        {state === "done" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
            <Download className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 dark:text-green-400">
              Downloaded dashboard-pages.zip — paste another URL to capture more pages.
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
