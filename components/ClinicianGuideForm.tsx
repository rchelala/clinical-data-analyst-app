"use client";

import { useState, useCallback, useRef } from "react";
import { Users, Loader2, Download, AlertCircle, RotateCcw, Upload, FileText } from "lucide-react";
import { AIProvider } from "@/lib/providers";

interface ClinicianGuideFormProps {
  provider: AIProvider;
}

export function ClinicianGuideForm({ provider: _provider }: ClinicianGuideFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("Clinician_Guide.docx");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".pbix")) {
      setError("Please select a .pbix Power BI file.");
      return;
    }
    setFile(f);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }, [downloadUrl]);

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

  const handleGenerate = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/clinician-guide", {
        method: "POST",
        body: formData,
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
      setFileName(nameMatch ? nameMatch[1] : "Clinician_Guide.docx");
      setDownloadUrl(url);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [file, downloadUrl]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    a.click();
  }, [downloadUrl, fileName]);

  const handleReset = useCallback(() => {
    setFile(null);
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [downloadUrl]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-theme bg-secondary flex-shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-secondary" />
          <span className="text-sm font-medium text-primary">Clinician Guide Generator</span>
          <span className="text-xs text-secondary">— upload a Power BI .pbix file</span>
        </div>

        <div className="flex items-center gap-2">
          {file && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme text-secondary hover:text-primary hover:bg-panel transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          {downloadUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Download .docx
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={!file || loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
            ) : (
              <><Users className="w-4 h-4" />Generate Guide</>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 animate-fade-in flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Success banner */}
      {downloadUrl && !error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-900 animate-fade-in flex-shrink-0">
          <Download className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">
            <strong>{fileName}</strong> is ready — click <strong>Download .docx</strong> above.
          </p>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* File upload area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-theme bg-panel flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${file ? "bg-green-500" : "bg-slate-400"}`} />
              <span className="text-xs font-medium text-secondary uppercase tracking-wide">
                Power BI File — .pbix
              </span>
            </div>
            {file && (
              <span className="text-xs text-secondary truncate max-w-xs">{file.name}</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center bg-secondary p-8">
            {file ? (
              /* File selected state */
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-panel border-2 border-green-400 dark:border-green-600">
                  <FileText className="w-7 h-7 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">{file.name}</p>
                  <p className="text-xs text-secondary mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Choose a different file
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pbix"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              /* Drop zone */
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center gap-4 text-center w-full max-w-sm py-12 px-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                  dragging
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
                    : "border-slate-300 dark:border-slate-600 hover:border-brand-400 hover:bg-panel"
                }`}
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-panel border border-theme">
                  <Upload className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Drop your .pbix file here</p>
                  <p className="text-xs text-secondary mt-1">or click to browse</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Power BI Desktop files only (.pbix)</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pbix"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="w-72 flex-shrink-0 border-l border-theme bg-panel overflow-y-auto">
          <div className="p-4 border-b border-theme">
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">What gets generated</h3>
            <ul className="space-y-2 text-xs text-secondary">
              {[
                ["Dashboard Overview", "Plain-language description of what the report does and who uses it"],
                ["Page-by-Page Guide", "Each report page explained with its purpose in clinical terms"],
                ["Visual Descriptions", "Every chart, table, and filter explained — no technical jargon"],
              ].map(([title, desc]) => (
                <li key={title} className="flex flex-col gap-0.5">
                  <span className="font-medium text-primary">{title}</span>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 border-b border-theme">
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">Output format</h3>
            <ul className="space-y-1.5 text-xs text-secondary">
              <li>• Word document (.docx)</li>
              <li>• US Letter, Arial font</li>
              <li>• Written for clinical staff</li>
              <li>• No technical terms</li>
              <li>• One section per report page</li>
            </ul>
          </div>

          <div className="p-4">
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Tip</h3>
            <p className="text-xs text-secondary leading-relaxed">
              Make sure your visuals have descriptive titles in Power BI — the guide uses visual titles to produce clearer descriptions for clinicians.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
