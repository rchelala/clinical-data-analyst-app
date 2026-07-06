"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { X, Loader2, Sparkles, ClipboardCheck, Clipboard, RefreshCw } from "lucide-react";
import { buildStructuredUpdate, WeeklyUpdateData } from "@/lib/weekly-update";
import { loadProvider } from "@/lib/providers";
import {
  loadWeeklySummary,
  saveWeeklySummary,
  computeSourceFingerprint,
  formatSavedAt,
} from "@/lib/weekly-summary-cache";

interface WeeklyUpdateDrawerProps {
  data: WeeklyUpdateData;
  analystId: number | null;
  onClose: () => void;
}

type Mode = "list" | "ai";

export function WeeklyUpdateDrawer({ data, analystId, onClose }: WeeklyUpdateDrawerProps) {
  // Hydrate once on mount (mount == open, since the drawer is conditionally
  // rendered by the parent). Read the cache a single time and seed all three
  // pieces of state from it.
  const cached = useRef(loadWeeklySummary(analystId)).current;

  const [mode, setMode] = useState<Mode>(cached ? "ai" : "list");
  const [aiText, setAiText] = useState<string>(cached?.summary ?? "");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Seeding aiRequested from the cache is what prevents auto-regeneration from
  // clobbering a restored summary when the user switches to the AI tab.
  const [aiRequested, setAiRequested] = useState(Boolean(cached?.summary));
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(cached?.updatedAt ?? null);
  // Fingerprint of the worklist data when the summary was last saved, tracked in
  // state so regenerating (which saves against the current data) clears staleness.
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(
    cached?.sourceFingerprint ?? null
  );
  const [confirmRegen, setConfirmRegen] = useState(false);
  // Bumped on every programmatic replacement of aiText so the contentEditable
  // div remounts with fresh initial text (React won't reconcile its children).
  const [editorEpoch, setEditorEpoch] = useState(0);

  const structuredMarkdown = useMemo(() => buildStructuredUpdate(data), [data]);
  const sourceFingerprint = useMemo(
    () => computeSourceFingerprint(structuredMarkdown),
    [structuredMarkdown]
  );
  const isStale = savedAt !== null && savedFingerprint !== sourceFingerprint;

  const persistSummary = useCallback(
    (text: string) => {
      if (analystId === null) return;
      const saved = saveWeeklySummary(analystId, text, sourceFingerprint);
      setSavedAt(saved?.updatedAt ?? null);
      setSavedFingerprint(saved?.sourceFingerprint ?? null);
    },
    [analystId, sourceFingerprint]
  );

  const handleCopy = useCallback(async () => {
    const text = mode === "list" ? structuredMarkdown : aiText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Non-critical — clipboard API may be unavailable.
    }
  }, [mode, structuredMarkdown, aiText]);

  const handleSummarize = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAiRequested(true);
    try {
      const res = await fetch("/api/weekly-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: structuredMarkdown,
          analystName: data.analystName,
          provider: loadProvider(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error ?? "Could not generate AI summary.");
        return;
      }
      const summary = json.summary ?? "";
      setAiText(summary);
      setEditorEpoch((e) => e + 1); // force the editor to remount with new text
      persistSummary(summary);
    } catch {
      setAiError("Network error — could not reach the server.");
    } finally {
      setAiLoading(false);
    }
  }, [structuredMarkdown, data.analystName, persistSummary]);

  const handleRegenerate = useCallback(() => {
    // Guard against silently destroying edits: require a second click to confirm
    // when there is existing text.
    if (aiText.trim() && !confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    setConfirmRegen(false);
    handleSummarize();
  }, [aiText, confirmRegen, handleSummarize]);

  const handleSetMode = useCallback(
    (m: Mode) => {
      setMode(m);
      if (m === "ai" && !aiRequested && !aiLoading) {
        handleSummarize();
      }
    },
    [aiRequested, aiLoading, handleSummarize]
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative h-full w-full sm:w-[620px] bg-elevated border-l border-theme shadow-panel flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-theme flex-shrink-0">
          <h2 className="text-sm font-semibold text-primary leading-none">
            Weekly Update — {data.analystName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel hover:bg-panel/80 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Segmented toggle */}
          <div className="inline-flex border border-theme rounded-lg overflow-hidden mb-3.5">
            <button
              type="button"
              onClick={() => handleSetMode("list")}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                mode === "list" ? "bg-brand-600 text-white" : "bg-panel text-secondary hover:text-primary"
              }`}
            >
              📋 Structured list
            </button>
            <button
              type="button"
              onClick={() => handleSetMode("ai")}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                mode === "ai" ? "bg-brand-600 text-white" : "bg-panel text-secondary hover:text-primary"
              }`}
            >
              ✨ AI summary
            </button>
          </div>

          {mode === "list" && (
            <>
              <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-primary bg-black/35 border border-theme rounded-lg p-4 m-0">
                {structuredMarkdown}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
              >
                {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy to clipboard"}
              </button>
              <p className="text-[11px] text-secondary mt-2.5">
                Built automatically from this analyst&apos;s dashboards, open/in-progress tasks, tasks
                completed in the last 7 days, PSQ status, and meetings.
              </p>
            </>
          )}

          {mode === "ai" && (
            <>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-purple-400">
                  <Sparkles className="w-3 h-3" />
                  Generated by AI — editable before sending
                </div>
                {savedAt !== null && (
                  <span className="text-[11px] text-secondary flex-shrink-0">
                    Saved {formatSavedAt(savedAt)}
                    {isStale && " · source data changed since"}
                  </span>
                )}
              </div>

              {aiLoading && (
                <div className="flex items-center gap-2 py-6 justify-center text-secondary text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Summarizing…
                </div>
              )}

              {!aiLoading && aiError && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-red-500">{aiError}</p>
                  <button
                    type="button"
                    onClick={handleSummarize}
                    className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!aiLoading && !aiError && (
                <>
                  <div
                    key={editorEpoch}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const next = e.currentTarget.innerText;
                      setAiText(next);
                      persistSummary(next);
                    }}
                    className="text-[13.5px] leading-relaxed text-primary bg-black/35 border border-theme rounded-lg p-4 outline-none focus:border-brand-500 transition-colors min-h-[120px] whitespace-pre-wrap"
                  >
                    {aiText}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                    >
                      {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy to clipboard"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      onBlur={() => setConfirmRegen(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        confirmRegen
                          ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                          : "border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {confirmRegen ? "Overwrite with fresh summary?" : "Regenerate"}
                    </button>
                  </div>
                </>
              )}

              <p className="text-[11px] text-secondary mt-2.5">
                AI summary uses your selected provider — edit freely before copying or sending.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
