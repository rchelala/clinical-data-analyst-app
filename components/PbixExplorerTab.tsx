"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileBarChart2, AlertCircle, Loader2 } from "lucide-react";
import { parsePbixFileClient } from "@/lib/pbix-parser-browser";
import type { PbixDashboard } from "@/lib/pbix-parser";

interface LoadedFile {
  dashboard: PbixDashboard;
  fileName: string;
}

interface FileError {
  name: string;
}

export function PbixExplorerTab() {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFiles = useCallback(async (files: File[]) => {
    const fileArray = files.filter((f) => f.name.toLowerCase().endsWith(".pbix"));
    const newFiles: LoadedFile[] = [];
    const newErrors: FileError[] = [];

    setIsProcessing(true);
    try {
      for (const file of fileArray) {
        try {
          const dashboard = await parsePbixFileClient(file);
          newFiles.push({ dashboard, fileName: file.name });
        } catch {
          newErrors.push({ name: file.name });
        }
      }

      setLoadedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.fileName));
        return [...prev, ...newFiles.filter((r) => !existingNames.has(r.fileName))];
      });
      setFileErrors((prev) => {
        const existingNames = new Set(prev.map((e) => e.name));
        return [...prev, ...newErrors.filter((e) => !existingNames.has(e.name))];
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [processFiles]
  );

  const removeFile = useCallback((fileName: string) => {
    setLoadedFiles((prev) => prev.filter((f) => f.fileName !== fileName));
  }, []);

  const removeError = useCallback((name: string) => {
    setFileErrors((prev) => prev.filter((e) => e.name !== name));
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Drop zone */}
      <div className="px-6 pt-4 pb-2 flex-shrink-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById("pbix-file-input")?.click()}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-colors ${
            isDragging
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
              : "border-theme hover:border-brand-400 bg-secondary"
          }${isProcessing ? " pointer-events-none opacity-60" : ""}`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-6 h-6 text-secondary animate-spin" />
              <p className="text-sm text-secondary">Parsing files…</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-secondary" />
              <div className="text-center">
                <p className="text-sm font-medium text-primary">Drop .pbix files here</p>
                <p className="text-xs text-secondary mt-0.5">or click to browse — multiple files supported</p>
              </div>
            </>
          )}
        </div>
        <input
          id="pbix-file-input"
          type="file"
          accept=".pbix"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Loaded file pills + error pills */}
      {(loadedFiles.length > 0 || fileErrors.length > 0) && (
        <div className="flex flex-wrap gap-2 px-6 pb-2 flex-shrink-0">
          {loadedFiles.map((f) => (
            <span
              key={f.fileName}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
            >
              <FileBarChart2 className="w-3 h-3" />
              {f.dashboard.reportName}
              <button
                onClick={() => removeFile(f.fileName)}
                className="ml-0.5 hover:text-brand-900 dark:hover:text-brand-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {fileErrors.map((e) => (
            <span
              key={e.name}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-3 h-3" />
              {e.name} — not a valid .pbix
              <button
                onClick={() => removeError(e.name)}
                className="ml-0.5 hover:text-red-900 dark:hover:text-red-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Placeholder for search + table (added in Task 3) */}
      <div className="flex-1 flex items-center justify-center text-secondary">
        <div className="flex flex-col items-center gap-3">
          <FileBarChart2 className="w-10 h-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium">Drop a .pbix file above to get started</p>
        </div>
      </div>
    </div>
  );
}
