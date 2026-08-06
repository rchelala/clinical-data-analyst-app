"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ClipboardList,
  Upload,
  FileText,
  Loader2,
  Download,
  FolderOpen,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  Info,
} from "lucide-react";
import { AIProvider } from "@/lib/providers";
import { parseTranscript } from "@/lib/parseTranscript";
import type { ExtractedRow } from "@/lib/cmio-review-prompt";
import { TaskStatusBadge } from "@/components/overview/StatusBadge";

interface CmioReviewFormProps {
  provider?: AIProvider;
}

type Mode = "append" | "standalone";

// Mirrors lib/cmio-tracker.ts's TrackerDisplayRow — defined locally because
// that module pulls in exceljs/jszip and must never be imported client-side.
interface TrackerDisplayRow {
  date: string;
  analyst: string;
  presenter: string;
  topic: string;
  action: string;
  priority: string;
  status: string;
  cmioComment: string;
}

interface TrackerInfo {
  held: boolean;
  version?: number;
  filename?: string;
  updatedAt?: string;
  rows?: TrackerDisplayRow[];
  rowCount?: number;
  rowsError?: boolean;
}

interface RunResult {
  rows: ExtractedRow[];
  notes: string[];
  priorityBreakdown: Record<ExtractedRow["priority"], number>;
  statusBreakdown: Record<ExtractedRow["status"], number>;
  resultVersion: number | null;
  downloadUrl: string;
  fileName: string;
}

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const PRIORITY_CLASSNAME: Record<ExtractedRow["priority"], string> = {
  High: "bg-red-500/10 text-red-400 border-red-500/30",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Low: "bg-white/5 text-secondary border-theme",
};

function PriorityPill({ priority }: { priority: ExtractedRow["priority"] }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${PRIORITY_CLASSNAME[priority]}`}
    >
      {priority}
    </span>
  );
}

const KNOWN_PRIORITIES = new Set(["High", "Medium", "Low"]);

// Read-only rows table for the held tracker's current contents. Differs from
// the just-ran result table by also surfacing the CMIO comment column, and
// tolerates raw/blank priority + status text since it reflects whatever is
// actually in the workbook rather than freshly-extracted, validated rows.
function TrackerRowsTable({ rows }: { rows: TrackerDisplayRow[] }) {
  return (
    <div className="rounded-xl border border-theme bg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary-glass border-b border-theme">
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Date</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Analyst</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Presented by</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Topic</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Action</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Priority</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Status</th>
              <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">CMIO comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-theme last:border-b-0">
                <td className="px-3 py-2 text-secondary whitespace-nowrap">{row.date || "—"}</td>
                <td className="px-3 py-2 text-primary whitespace-nowrap">{row.analyst}</td>
                <td className="px-3 py-2 text-secondary whitespace-nowrap">{row.presenter || "—"}</td>
                <td className="px-3 py-2 text-secondary">{row.topic}</td>
                <td className="px-3 py-2 text-primary max-w-xs whitespace-normal">{row.action}</td>
                <td className="px-3 py-2">
                  {KNOWN_PRIORITIES.has(row.priority) ? (
                    <PriorityPill priority={row.priority as ExtractedRow["priority"]} />
                  ) : (
                    row.priority || null
                  )}
                </td>
                <td className="px-3 py-2">{row.status ? <TaskStatusBadge status={row.status} /> : null}</td>
                <td className="px-3 py-2 text-secondary whitespace-normal">{row.cmioComment || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatUpdatedAt(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Reads a File as base64 (no data: URL prefix) for the tracker-seed upload —
// the tracker route expects raw base64 in JSON, same contract the .pbix
// client-side parsing elsewhere in this app avoids re-deriving on the server.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export function CmioReviewForm({ provider: _provider }: CmioReviewFormProps) {
  const [tracker, setTracker] = useState<TrackerInfo | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<Mode>("standalone");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingCurrent, setDownloadingCurrent] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const loadTracker = useCallback(async () => {
    setTrackerLoading(true);
    try {
      const res = await fetch("/api/cmio-review/tracker");
      const data = await res.json();
      if (res.ok) {
        setTracker(data);
        setMode(data.held ? "append" : "standalone");
      } else {
        setTracker({ held: false });
      }
    } catch {
      setTracker({ held: false });
    } finally {
      setTrackerLoading(false);
    }
  }, []);

  useEffect(() => { loadTracker(); }, [loadTracker]);

  const acceptFile = useCallback((f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith(".docx") && !name.endsWith(".vtt") && !name.endsWith(".txt")) {
      setError("Please select a .docx, .vtt, or .txt transcript.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const handleReplaceTracker = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setReplaceError("Please select a .xlsx file.");
      return;
    }
    setReplacing(true);
    setReplaceError(null);
    try {
      const dataBase64 = await readFileAsBase64(f);
      const res = await fetch("/api/cmio-review/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, filename: f.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplaceError(data.error ?? "Could not upload this tracker.");
        return;
      }
      setTracker(data);
      setMode("append");
    } catch {
      setReplaceError("Network error — could not reach the server.");
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!file) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      let transcript: string;
      try {
        transcript = await parseTranscript(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read this transcript file.");
        return;
      }

      if (!transcript.trim()) {
        setError("This transcript appears to be empty.");
        return;
      }

      const startRes = await fetch("/api/cmio-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, mode }),
      });

      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        return;
      }

      const { jobId, chunksTotal } = await startRes.json();
      setProgress({ done: 0, total: chunksTotal });

      for (;;) {
        const stepRes = await fetch("/api/cmio-review/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });

        if (!stepRes.ok) {
          setError("Something went wrong generating the tracker.");
          return;
        }

        const stepData = await stepRes.json();

        if (stepData.status === "failed") {
          setError(stepData.error ?? "Something went wrong generating the tracker.");
          return;
        }

        if (stepData.status === "done") {
          setResult({
            rows: stepData.rows ?? [],
            notes: stepData.notes ?? [],
            priorityBreakdown: stepData.priorityBreakdown,
            statusBreakdown: stepData.statusBreakdown,
            resultVersion: stepData.resultVersion,
            downloadUrl: stepData.downloadUrl,
            fileName: stepData.fileName,
          });
          if (mode === "append") loadTracker();
          return;
        }

        setProgress({ done: stepData.chunksDone, total: stepData.chunksTotal });
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setRunning(false);
    }
  }, [file, mode, loadTracker]);

  const handleDownload = useCallback(async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const res = await fetch(result.downloadUrl);
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the file. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [result]);

  const handleSaveAs = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch(result.downloadUrl);
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();

      if ("showSaveFilePicker" in window) {
        const fileHandle = await (window as Window & { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> })
          .showSaveFilePicker({
            suggestedName: result.fileName,
            types: [{
              description: "Excel Workbook",
              accept: { [XLSX_CONTENT_TYPE]: [".xlsx"] },
            }],
          });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        console.error("Save failed:", err);
        setError("Could not save the file. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }, [result]);

  const handleDownloadCurrent = useCallback(async () => {
    if (!tracker?.held || !tracker.filename) return;
    setDownloadingCurrent(true);
    try {
      const res = await fetch("/api/cmio-review/tracker/download");
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = tracker.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the current tracker. Please try again.");
    } finally {
      setDownloadingCurrent(false);
    }
  }, [tracker]);

  const handleReset = useCallback(() => {
    setFile(null);
    setError(null);
    setResult(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const busy = running || downloading || saving;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-3 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-secondary" />
          <span className="text-sm font-semibold text-primary">CMIO Review</span>
          <span className="text-xs text-secondary hidden sm:inline">— drop a meeting transcript, get back the tracker</span>
          <span className="text-[10px] font-medium text-brand-400 border border-brand-500/30 bg-brand-500/10 rounded-full px-2 py-0.5">
            Powered by Claude · Sonnet
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(file || result) && (
            <button
              onClick={handleReset}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start over
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={!file || running}
            className="btn-shimmer flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 transition-all duration-200"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {progress
                  ? `Reading the transcript with Sonnet… chunk ${progress.done} of ${progress.total}`
                  : "Reading the transcript with Sonnet…"}
              </>
            ) : (
              <><ClipboardList className="w-4 h-4" />Generate</>
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

      {/* Main content — two columns, stacks below md */}
      <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden overflow-y-auto">
        {/* Left column: config — fixed width so results get the remaining space */}
        <div className="flex flex-col w-full md:w-[420px] md:flex-shrink-0 md:overflow-y-auto border-b md:border-b-0 md:border-r border-theme">
          <div className="p-6 space-y-6">

            {/* Held tracker card */}
            <div className="rounded-xl border border-theme bg-panel shadow-panel p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">Held tracker</h3>
                <button
                  onClick={loadTracker}
                  title="Refresh"
                  className="text-secondary hover:text-primary transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${trackerLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {trackerLoading ? (
                <p className="text-sm text-secondary">Checking for a held tracker…</p>
              ) : tracker?.held ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary border border-emerald-500/40 flex-shrink-0">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{tracker.filename}</p>
                    <p className="text-xs text-secondary">
                      v{tracker.version} · updated {formatUpdatedAt(tracker.updatedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-secondary">
                  No tracker held yet. Upload the current tracker below, or choose &ldquo;Create a standalone Excel&rdquo;.
                </p>
              )}

              <div className="mt-3 pt-3 border-t border-theme">
                <button
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={replacing}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {replacing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {replacing ? "Uploading…" : (tracker?.held ? "Replace held copy" : "Seed held tracker")}
                </button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleReplaceTracker}
                  className="hidden"
                />
                {replaceError && (
                  <p className="text-xs text-red-400 mt-1.5">{replaceError}</p>
                )}
              </div>
            </div>

            {/* Transcript dropzone */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wide">Meeting transcript</label>
              {file ? (
                <div className="flex items-center gap-4 rounded-2xl border border-theme bg-panel shadow-panel py-6 px-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary border-2 border-emerald-500/40 flex-shrink-0">
                    <FileText className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary truncate">{file.name}</p>
                    <p className="text-xs text-secondary mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={running}
                    className="text-xs text-brand-400 hover:text-brand-300 hover:underline disabled:opacity-50 flex-shrink-0"
                  >
                    Choose different file
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".docx,.vtt,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`flex flex-col items-center gap-3 text-center py-10 px-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                    dragging
                      ? "border-brand-500/50 bg-brand-500/10"
                      : "border-theme hover:border-brand-500/50 hover:bg-brand-500/10"
                  }`}
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-panel border border-theme hairline-top">
                    <Upload className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Drop your Teams transcript here</p>
                    <p className="text-xs text-secondary mt-1">or click to browse</p>
                  </div>
                  <span className="text-xs text-secondary/70">.docx, .vtt, or .txt</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".docx,.vtt,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Mode choice */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wide">Output</label>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    mode === "append" ? "border-brand-500/50 bg-brand-500/10" : "border-theme bg-panel"
                  } ${!tracker?.held ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="cmio-mode"
                    checked={mode === "append"}
                    disabled={!tracker?.held}
                    onChange={() => setMode("append")}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-primary">Append to the current tracker</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {tracker?.held
                        ? "Adds this meeting's rows to the held tracker and versions it."
                        : "Requires a held tracker — upload one above first."}
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    mode === "standalone" ? "border-brand-500/50 bg-brand-500/10" : "border-theme bg-panel"
                  }`}
                >
                  <input
                    type="radio"
                    name="cmio-mode"
                    checked={mode === "standalone"}
                    onChange={() => setMode("standalone")}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-primary">Create a standalone Excel</p>
                    <p className="text-xs text-secondary mt-0.5">A fresh workbook with just this meeting&rsquo;s rows.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: results — flexes to fill the remaining width */}
        <div className="w-full md:flex-1 md:min-w-0 md:overflow-y-auto bg-secondary">
          {result ? (
            <div className="p-4 space-y-4 animate-fade-in">
              {/* Success banner */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-400">
                  <strong>{result.fileName}</strong> is ready.
                </p>
              </div>

              {/* Download / Save As buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveAs}
                  disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <FolderOpen className="w-4 h-4" />
                  {saving ? "Saving…" : "Save As…"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={busy}
                  className="btn-shimmer flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 hover:brightness-110 transition-all duration-200"
                >
                  <Download className="w-4 h-4" />
                  {downloading ? "Downloading…" : "Download"}
                </button>
              </div>

              {/* Append version reminder */}
              {result.resultVersion != null && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-brand-500/10 border border-brand-500/30">
                  <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-brand-300 leading-relaxed">
                    ClinKit&rsquo;s held tracker is now <strong>v{result.resultVersion}</strong>. Upload this file to the channel
                    Files tab, replacing the existing one — SharePoint keeps the old version automatically.
                  </p>
                </div>
              )}

              {/* Priority breakdown */}
              <p className="text-xs text-secondary">
                {result.priorityBreakdown.High} High · {result.priorityBreakdown.Medium} Medium · {result.priorityBreakdown.Low} Low
              </p>

              {/* Rows table */}
              <div className="rounded-xl border border-theme bg-panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary-glass border-b border-theme">
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Date</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Analyst</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Presented by</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Topic</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Action</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Priority</th>
                        <th className="text-left font-semibold text-secondary uppercase tracking-wide px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-theme last:border-b-0" title={row.source || undefined}>
                          <td className="px-3 py-2 text-secondary whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2 text-primary whitespace-nowrap">{row.analyst}</td>
                          <td className="px-3 py-2 text-secondary whitespace-nowrap">{row.presenter || "—"}</td>
                          <td className="px-3 py-2 text-secondary">{row.topic}</td>
                          <td className="px-3 py-2 text-primary max-w-xs">{row.action}</td>
                          <td className="px-3 py-2"><PriorityPill priority={row.priority} /></td>
                          <td className="px-3 py-2"><TaskStatusBadge status={row.status} /></td>
                        </tr>
                      ))}
                      {result.rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-secondary">
                            No action items were extracted from this transcript.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {result.notes.length > 0 && (
                <ul className="space-y-1.5">
                  {result.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-secondary">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-secondary/70" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : tracker?.held ? (
            <div className="p-4 space-y-4 animate-fade-in">
              {/* Current tracker header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-primary truncate">
                    {tracker.filename} <span className="text-secondary font-normal">v{tracker.version}</span>
                  </h3>
                  <p className="text-xs text-secondary">updated {formatUpdatedAt(tracker.updatedAt)}</p>
                </div>
                <button
                  onClick={handleDownloadCurrent}
                  disabled={downloadingCurrent}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <FolderOpen className="w-4 h-4" />
                  {downloadingCurrent ? "Downloading…" : "Download current tracker"}
                </button>
              </div>

              {tracker.rowsError && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Couldn&rsquo;t load the preview — the file is still downloadable.
                  </p>
                </div>
              )}

              <p className="text-xs text-secondary">
                {tracker.rowCount ?? 0} row{tracker.rowCount === 1 ? "" : "s"} logged
              </p>

              {(tracker.rows?.length ?? 0) === 0 ? (
                !tracker.rowsError && (
                  <p className="text-sm text-secondary">No rows logged in this tracker yet.</p>
                )
              ) : (
                <TrackerRowsTable rows={tracker.rows ?? []} />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[16rem] gap-3 p-8 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-panel border border-theme">
                <ClipboardList className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-secondary">Results will appear here</p>
                <p className="text-xs text-secondary/70 mt-1">
                  Drop a transcript and click Generate — or hold a tracker to see its contents here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
