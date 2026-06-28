"use client";

import { useCallback, useMemo, useState } from "react";
import { X, Loader2, Sparkles, ClipboardCheck, Clipboard } from "lucide-react";
import { buildStructuredUpdate, WeeklyUpdateData } from "@/lib/weekly-update";
import { loadProvider } from "@/lib/providers";

interface WeeklyUpdateDrawerProps {
  data: WeeklyUpdateData;
  onClose: () => void;
}

type Mode = "list" | "ai";

export function WeeklyUpdateDrawer({ data, onClose }: WeeklyUpdateDrawerProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRequested, setAiRequested] = useState(false);
  const [copied, setCopied] = useState(false);

  const structuredMarkdown = useMemo(() => buildStructuredUpdate(data), [data]);

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
      setAiText(json.summary ?? "");
    } catch {
      setAiError("Network error — could not reach the server.");
    } finally {
      setAiLoading(false);
    }
  }, [structuredMarkdown, data.analystName]);

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
      <div className="relative h-full w-full sm:w-[620px] bg-panel border-l border-theme shadow-xl flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-theme flex-shrink-0">
          <h2 className="text-sm font-semibold text-primary leading-none">
            Weekly Update — {data.analystName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
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
              <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-primary bg-[var(--bg,_#0d1117)] border border-theme rounded-lg p-4 m-0">
                {structuredMarkdown}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
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
              <div className="flex items-center gap-1.5 text-[11px] text-purple-400 mb-2.5">
                <Sparkles className="w-3 h-3" />
                Generated by AI — editable before sending
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
                    className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!aiLoading && !aiError && (
                <>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => setAiText(e.currentTarget.innerText)}
                    className="text-[13.5px] leading-relaxed text-primary bg-[var(--bg,_#0d1117)] border border-theme rounded-lg p-4 outline-none focus:border-brand-500 transition-colors min-h-[120px] whitespace-pre-wrap"
                  >
                    {aiText}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy to clipboard"}
                  </button>
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
