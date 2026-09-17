"use client";

import { useState, useCallback, useEffect, memo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { AiInfoButton } from "@/components/AiInfoButton";
import { CodePanel } from "@/components/CodePanel";
import { DiffPanel } from "@/components/DiffPanel";
import { CommenterInputPanel } from "@/components/CommenterInputPanel";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DensitySelector } from "@/components/DensitySelector";
import { Language, Density } from "@/lib/prompts";
import { HistoryEntry, loadHistory, addHistoryEntry, removeHistoryEntry } from "@/lib/history";
import { AIProvider, loadProvider, saveProvider, PROVIDER_LABELS } from "@/lib/providers";
import { Sparkles, Copy, Check, RotateCcw, AlertCircle, Loader2, FileText, ChevronDown, ChevronUp, Code2, TableProperties, Download, GitCompare, History, Bot, Users, Search, BrainCircuit, ClipboardList, Building2 } from "lucide-react";

// Each of these tabs is a large, self-contained tool (300-800 lines) and only
// one is visible at a time, so they're code-split with next/dynamic instead
// of being pulled into the initial page bundle. ssr:false matches how
// CodePanel/DiffPanel lazy-load Monaco — these are client-only tools with no
// SSR value. Wrapped in React.memo because, per requirement 3 below, visited
// tabs stay mounted (hidden, not unmounted) so their internal state survives
// switching — without memo, every keystroke in the Commenter tab (input state
// lives in this file) would re-render all other mounted-but-hidden tabs too.
const TabLoadingFallback = () => (
  <div className="flex flex-col flex-1 items-center justify-center gap-3 text-secondary">
    <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
    <span className="text-sm">Loading…</span>
  </div>
);

const FieldRequestForm = memo(dynamic(() => import("@/components/FieldRequestForm").then((m) => m.FieldRequestForm), {
  ssr: false,
  loading: TabLoadingFallback,
}));
const ITReferenceForm = memo(dynamic(() => import("@/components/ITReferenceForm").then((m) => m.ITReferenceForm), {
  ssr: false,
  loading: TabLoadingFallback,
}));
const ClinicianGuideForm = memo(dynamic(() => import("@/components/ClinicianGuideForm").then((m) => m.ClinicianGuideForm), {
  ssr: false,
  loading: TabLoadingFallback,
}));
const PbixExplorerTab = memo(dynamic(() => import("@/components/PbixExplorerTab").then((m) => m.PbixExplorerTab), {
  ssr: false,
  loading: TabLoadingFallback,
}));
const CmioReviewForm = memo(dynamic(() => import("@/components/CmioReviewForm").then((m) => m.CmioReviewForm), {
  ssr: false,
  loading: TabLoadingFallback,
}));
const HistoryPanel = dynamic(() => import("@/components/HistoryPanel").then((m) => m.HistoryPanel), {
  ssr: false,
});

const APP_TABS = [
  { id: "field-request",    label: "Field Request",   Icon: TableProperties },
  { id: "it-reference",     label: "IT Reference",    Icon: FileText        },
  { id: "clinician-guide",  label: "Clinician Guide", Icon: Users           },
  { id: "pbix-explorer",    label: "PBIX Explorer",   Icon: Search          },
  { id: "cmio-review",      label: "CMIO Review",     Icon: ClipboardList   },
  { id: "commenter",        label: "Commenter",       Icon: Code2           },
] as const;

const DAX_PLACEHOLDER = `// Paste your DAX measure here, e.g.:

Total Sales YTD =
CALCULATE(
    SUM(Sales[Amount]),
    DATESYTD(Calendar[Date])
)`;

const SQL_PLACEHOLDER = `-- Paste your SQL query here, e.g.:

SELECT
    c.CustomerName,
    SUM(o.TotalAmount) AS TotalSpend
FROM Customers c
JOIN Orders o ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= '2024-01-01'
GROUP BY c.CustomerName
ORDER BY TotalSpend DESC;`;

type AppTab = "commenter" | "field-request" | "it-reference" | "clinician-guide" | "pbix-explorer" | "cmio-review";

export default function Home() {
  const [activeTab, setActiveTab]       = useState<AppTab>("field-request");
  const [language, setLanguage]         = useState<Language>("dax");
  const [density, setDensity]           = useState<Density>("detailed");
  const [input, setInput]               = useState("");
  const [output, setOutput]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [summarizing, setSummarizing]   = useState(false);
  const [summary, setSummary]           = useState("");
  const [summaryOpen, setSummaryOpen]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [diffMode, setDiffMode]         = useState(false);
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [provider, setProvider]         = useState<AIProvider>("claude");

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => { setProvider(loadProvider()); }, []);

  const handleProviderChange = useCallback((p: AIProvider) => {
    setProvider(p);
    saveProvider(p);
  }, []);

  const handleComment = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setOutput("");

    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input, language, density, mode: "comment", provider }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setOutput(data.commented);
      setHistory((prev) => addHistoryEntry(prev, { input, output: data.commented, language, density }));
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [input, language, density, provider]);

  const handleSummarize = useCallback(async () => {
    if (!input.trim()) return;
    setSummarizing(true);
    setError(null);
    setSummary("");
    setSummaryOpen(true);

    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input, language, mode: "summarize", provider }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setSummary(data.summary);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSummarizing(false);
    }
  }, [input, language, provider]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const ext = language === "dax" ? "dax" : "sql";
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commented_code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, language]);

  const handleReset = useCallback(() => {
    setInput("");
    setOutput("");
    setSummary("");
    setSummaryOpen(false);
    setDiffMode(false);
    setError(null);
  }, []);

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    setInput(entry.input);
    setOutput(entry.output);
    setLanguage(entry.language);
    setDensity(entry.density);
    setSummary("");
    setSummaryOpen(false);
    setDiffMode(false);
    setError(null);
  }, []);

  const handleHistoryDelete = useCallback((id: string) => {
    setHistory((prev) => removeHistoryEntry(prev, id));
  }, []);

  const handleHistoryClear = useCallback(() => {
    setHistory([]);
  }, []);

  const placeholder = language === "dax" ? DAX_PLACEHOLDER : SQL_PLACEHOLDER;
  const isWorking = loading || summarizing;

  // Tabs stay mounted once visited instead of being unmounted on switch, so
  // uploaded files / results / in-progress work inside them survive tab
  // switches (M5). They're only ever rendered once first opened, so an
  // unvisited tab's dynamic() import never fires and never downloads its
  // chunk. Hidden tabs use inline `display: none` (not a className toggle)
  // so it can't lose to a `.flex{display:flex}` utility class on the same
  // element — see components in APP_TABS below.
  const [visitedTabs, setVisitedTabs] = useState<Set<AppTab>>(() => new Set([activeTab]));

  const selectTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  return (
    <div className="flex flex-col h-screen md:overflow-hidden overflow-y-auto">
      {/* Eclipse ambient glow — behind all content, starts at top of page */}
      <div className="eclipse-glow" />
      <div className="eclipse-grain" />
      <Header provider={provider} onProviderChange={handleProviderChange} />

      {/* Mobile nav bar (below md) */}
      <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
        <MobileNav
          active="home"
          subTabs={APP_TABS.map(({ id, label, Icon }) => ({ id, label, Icon }))}
          activeSubTab={activeTab}
          onSubTabSelect={(id) => selectTab(id as AppTab)}
          provider={provider}
          onProviderChange={handleProviderChange}
        />
        <span className="text-sm font-medium text-primary capitalize">
          {APP_TABS.find((t) => t.id === activeTab)?.label ?? "Home"}
        </span>
        <div className="ml-auto">
          <AiInfoButton />
        </div>
      </div>

      {/* Tab bar */}
      <div className="hidden md:flex items-center gap-1 px-6 border-b border-theme bg-primary-glass flex-shrink-0">
        {APP_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? "border-brand-500 text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <Link
          href="/brain"
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-secondary hover:text-primary transition-colors"
        >
          <BrainCircuit className="w-4 h-4" />
          Brain
        </Link>
        <Link
          href="/worklist"
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-secondary hover:text-primary transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          Worklist
        </Link>
        <Link
          href="/overview"
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-secondary hover:text-primary transition-colors"
        >
          <Building2 className="w-4 h-4" />
          Overview
        </Link>
      </div>

      {/* ── Field Request tab (stays mounted once visited; hidden via inline
           display so uploads/results survive switching away) ── */}
      {visitedTabs.has("field-request") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "field-request" ? "flex" : "none" }}>
          <FieldRequestForm provider={provider} />
        </div>
      )}

      {/* ── IT Reference tab ── */}
      {visitedTabs.has("it-reference") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "it-reference" ? "flex" : "none" }}>
          <ITReferenceForm provider={provider} />
        </div>
      )}

      {/* ── Clinician Guide tab ── */}
      {visitedTabs.has("clinician-guide") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "clinician-guide" ? "flex" : "none" }}>
          <ClinicianGuideForm provider={provider} />
        </div>
      )}

      {/* ── PBIX Explorer tab ── */}
      {visitedTabs.has("pbix-explorer") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "pbix-explorer" ? "flex" : "none" }}>
          <PbixExplorerTab />
        </div>
      )}

      {/* ── CMIO Review tab ── */}
      {visitedTabs.has("cmio-review") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "cmio-review" ? "flex" : "none" }}>
          <CmioReviewForm provider={provider} />
        </div>
      )}

      {/* ── Commenter tab ── */}
      {visitedTabs.has("commenter") && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ display: activeTab === "commenter" ? "flex" : "none" }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
            <div className="flex items-center gap-4 flex-wrap">
              <LanguageToggle value={language} onChange={(l) => { setLanguage(l); setOutput(""); setSummary(""); setError(null); }} />
              <DensitySelector value={density} onChange={setDensity} />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistoryOpen(true)}
                title="Recent sessions"
                className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                History
                {history.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-brand-600 text-white">
                    {history.length > 9 ? "9+" : history.length}
                  </span>
                )}
              </button>

              {(input || output) && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}

              <button
                onClick={handleSummarize}
                disabled={!input.trim() || isWorking}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-theme bg-panel hover:bg-panel/80 text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {summarizing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Summarizing…</>
                ) : (
                  <><FileText className="w-4 h-4" />Summarize</>
                )}
              </button>

              <button
                onClick={handleComment}
                disabled={!input.trim() || isWorking}
                className="btn-shimmer flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 transition-all duration-200"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Commenting…</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Add Comments</>
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

          {/* Split panels */}
          <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">
            {/* Input panel — extracted so Monaco's per-keystroke onChange
                only re-renders this leaf, not the toolbar/output/other tabs */}
            <CommenterInputPanel value={input} onChange={setInput} language={language} placeholder={placeholder} />

            {/* Output panel */}
            <div className="flex flex-col flex-1 overflow-hidden min-h-[40vh] md:min-h-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${output ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-secondary/40"}`} />
                  <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
                    Output · Commented
                  </span>
                </div>
                {output && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDiffMode((d) => !d)}
                      title="Toggle diff view"
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                        diffMode
                          ? "border-brand-500/50 bg-brand-500/15 text-brand-400"
                          : "border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80"
                      }`}
                    >
                      <GitCompare className="w-3 h-3" />
                      Diff
                    </button>
                    <button
                      onClick={handleDownload}
                      title={`Download as .${language === "dax" ? "dax" : "sql"}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      .{language === "dax" ? "dax" : "sql"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
                    >
                      {copied ? (
                        <><Check className="w-3 h-3 text-emerald-400" />&nbsp;Copied!</>
                      ) : (
                        <><Copy className="w-3 h-3" />&nbsp;Copy</>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-hidden bg-panel relative">
                {!output && !loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary border border-theme">
                      <Sparkles className="w-5 h-5 text-secondary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-secondary">Commented code will appear here</p>
                      <p className="text-xs text-secondary/70 mt-1">
                        Paste your {language.toUpperCase()} on the left and click <strong className="text-secondary">Add Comments</strong>
                      </p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                      <span className="text-sm font-medium text-secondary">
                        {provider === "gemini" ? "Gemini" : "Claude"} is reading your {language.toUpperCase()}…
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 w-72 opacity-60">
                      {[80, 60, 90, 50, 75].map((w, i) => (
                        <div
                          key={i}
                          className="h-3 rounded bg-panel animate-pulse"
                          style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {output && !loading && (
                  <div className="h-full animate-fade-in">
                    {diffMode
                      ? <DiffPanel original={input} modified={output} language={language} />
                      : <CodePanel value={output} language={language} readOnly />
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* History drawer */}
          <HistoryPanel
            entries={history}
            onSelect={handleHistorySelect}
            onDelete={handleHistoryDelete}
            onClearAll={handleHistoryClear}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />

          {/* Summary panel */}
          {(summaryOpen || summarizing) && (
            <div className="flex-shrink-0 border-t border-theme bg-panel animate-fade-in">
              <button
                onClick={() => setSummaryOpen((o) => !o)}
                className="flex items-center justify-between w-full px-4 py-2 border-b border-theme bg-secondary-glass hairline-top hover:bg-panel/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-secondary" />
                  <span className="text-xs font-semibold text-secondary uppercase tracking-wide">Summary</span>
                </div>
                {summaryOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-secondary" />
                  : <ChevronUp className="w-3.5 h-3.5 text-secondary" />
                }
              </button>

              {summaryOpen && (
                <div className="px-6 py-4 h-40 overflow-y-auto">
                  {summarizing ? (
                    <div className="flex items-center gap-2 text-secondary">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                      <span className="text-sm">Analyzing your {language.toUpperCase()}…</span>
                    </div>
                  ) : (
                    <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap">{summary}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
