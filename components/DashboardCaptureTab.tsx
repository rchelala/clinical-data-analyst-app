// components/DashboardCaptureTab.tsx
"use client";

import { useState } from "react";
import { Camera, Loader2, Download, CheckSquare, Square, AlertCircle } from "lucide-react";
import { parsePbrsPortalUrl } from "@/lib/powerbi-export-client";

type CaptureState = "idle" | "loading-pages" | "pages-ready" | "capturing" | "done";

export function DashboardCaptureTab() {
  const [url, setUrl]           = useState("");
  const [state, setState]       = useState<CaptureState>("idle");
  const [pages, setPages]       = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError]       = useState<string | null>(null);

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

  return (
    <div className="flex flex-col flex-1 overflow-auto p-6 bg-primary">
      <div className="max-w-2xl mx-auto w-full space-y-6">

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

        {/* Setup hint (shown only when idle with no URL) */}
        {state === "idle" && !url && (
          <p className="text-xs text-secondary">
            Local-only feature. Requires{" "}
            <code className="font-mono bg-panel px-1 rounded border border-theme">npm run dev</code>{" "}
            and a one-time{" "}
            <code className="font-mono bg-panel px-1 rounded border border-theme">npx playwright install chromium</code>.
          </p>
        )}
      </div>
    </div>
  );
}
