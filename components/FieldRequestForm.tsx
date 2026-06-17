"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Download, FolderOpen, TableProperties, Sparkles, Loader2, Copy, Check, History, CopyPlus, LayoutDashboard } from "lucide-react";
import { FieldHistoryPanel } from "@/components/FieldHistoryPanel";
import { AttachToDashboardModal } from "./AttachToDashboardModal";
import {
  FieldRequestEntry,
  loadFieldHistory,
  addFieldHistoryEntry,
  removeFieldHistoryEntry,
  markFieldHistoryEntryAttached,
} from "@/lib/history";
import { AIProvider } from "@/lib/providers";

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateType = "general" | "quippe" | "structured-note";

interface ColumnDef {
  key: string;
  label: string;
  excelHeader: string;
  formWidth: string;
  excelWidth: number;
  selectOptions?: string[];
  isYellow?: boolean;
  placeholder?: string;
}

interface GenericRow {
  id: number;
  [key: string]: string | number;
}

// ─── Column definitions ───────────────────────────────────────────────────────

const NR_COL: ColumnDef = {
  key: "newRevised", label: "New / Revised", excelHeader: "New/Revised",
  formWidth: "8rem", excelWidth: 13, selectOptions: ["New", "Revised"],
};

const GRANULARITY_COL: ColumnDef = {
  key: "granularity", label: "Granularity", excelHeader: "Granularity",
  formWidth: "10rem", excelWidth: 15, selectOptions: ["Patient Level", "Visit Level"],
};

const NR_COL_QUIPPE: ColumnDef = { ...NR_COL, label: "New / Revision", excelHeader: "New or Revision" };

const GENERAL_COLUMNS: ColumnDef[] = [
  NR_COL,
  GRANULARITY_COL,
  { key: "field",    label: "Field Name", excelHeader: "Field",    formWidth: "1fr",  excelWidth: 28, placeholder: "e.g. EduIndividualEducation" },
  { key: "format",   label: "Format",     excelHeader: "Format",   formWidth: "7rem", excelWidth: 12, placeholder: "e.g. text" },
  { key: "tooltip",  label: "ToolTip",    excelHeader: "ToolTip",  formWidth: "1fr",  excelWidth: 45, placeholder: "Short description for end users" },
  { key: "comments", label: "Comments",   excelHeader: "Comments", formWidth: "1fr",  excelWidth: 45, isYellow: true, placeholder: "Notes (highlights yellow in Excel)" },
];

const QUIPPE_COLUMNS: ColumnDef[] = [
  NR_COL_QUIPPE,
  GRANULARITY_COL,
  { key: "cubeObjectName",  label: "Cube Object Name",      excelHeader: "Cube Object Name",      formWidth: "1fr",   excelWidth: 22, placeholder: "e.g. HbA1c_Avg" },
  { key: "template",        label: "Template (Quippe)",     excelHeader: "Template (Quippe)",     formWidth: "1fr",   excelWidth: 20, placeholder: "Template name" },
  { key: "findingName",     label: "FindingName (Quippe)",  excelHeader: "FindingName (Quippe)",  formWidth: "1fr",   excelWidth: 22, placeholder: "Finding name" },
  { key: "medcinId",        label: "MedcinId (Quippe)",     excelHeader: "MedcinId (Quippe)",     formWidth: "10rem", excelWidth: 14, placeholder: "Medcin ID" },
  { key: "text",            label: "Text (Quippe)",         excelHeader: "Text (Quippe)",         formWidth: "1fr",   excelWidth: 30, placeholder: "Display text" },
  { key: "logic",           label: "Logic",                 excelHeader: "Logic",                 formWidth: "1fr",   excelWidth: 30, placeholder: "Logic description" },
  { key: "tooltip",         label: "Tooltip (Description)", excelHeader: "Tooltip (Description)", formWidth: "1fr",   excelWidth: 35, placeholder: "Tooltip text" },
  { key: "patientExamples", label: "Patient Examples & Notes", excelHeader: "Patient Examples & Notes", formWidth: "1fr", excelWidth: 35, isYellow: true, placeholder: "Patient examples" },
];

const STRUCTURED_NOTE_COLUMNS: ColumnDef[] = [
  NR_COL_QUIPPE,
  GRANULARITY_COL,
  { key: "cubeObjectName",      label: "Cube Object Name", excelHeader: "Cube Object Name",                                                  formWidth: "1fr",   excelWidth: 22, placeholder: "e.g. DiabetesNote" },
  { key: "documentName",        label: "DocumentName",     excelHeader: "DocumentName (SCM/Structured Note)",                                formWidth: "1fr",   excelWidth: 28, placeholder: "Document name" },
  { key: "displayName",         label: "DisplayName",      excelHeader: "DisplayName (SCM/Structured Note)",                                 formWidth: "1fr",   excelWidth: 26, placeholder: "Display name" },
  { key: "leftJustifiedLabel",  label: "Left Label",       excelHeader: "LeftJustifiedLabel NOT used in SQL filtering (SCM/Structured Note)", formWidth: "1fr",  excelWidth: 28, placeholder: "Left justified label" },
  { key: "rightJustifiedLabel", label: "Right Label",      excelHeader: "Right JustifiedLabel NOT used in SQL filtering (SCM/Structured Note)", formWidth: "1fr", excelWidth: 28, placeholder: "Right justified label" },
  { key: "ocmi",                label: "OCMI",             excelHeader: "OCMI (SCM/Structured Note)",                                        formWidth: "7rem",  excelWidth: 18, placeholder: "OCMI value" },
  { key: "dataTypeName",        label: "DataTypeName",     excelHeader: "DataTypeName (SCM/Structured Note)",                                formWidth: "1fr",   excelWidth: 24, placeholder: "Data type" },
  { key: "logic",               label: "Logic",            excelHeader: "Logic",                                                             formWidth: "1fr",   excelWidth: 28, placeholder: "Logic description" },
  { key: "tooltip",             label: "Tooltip (Description)", excelHeader: "Tooltip (Description)",                                        formWidth: "1fr",   excelWidth: 35, placeholder: "Tooltip text" },
  { key: "patientExamples",     label: "Patient Examples & Notes", excelHeader: "Patient Examples & Notes",                                  formWidth: "1fr",   excelWidth: 35, isYellow: true, placeholder: "Patient examples" },
];

function getColumns(type: TemplateType): ColumnDef[] {
  if (type === "quippe") return QUIPPE_COLUMNS;
  if (type === "structured-note") return STRUCTURED_NOTE_COLUMNS;
  return GENERAL_COLUMNS;
}

function getTableLabel(type: TemplateType): string {
  return type === "general" ? "Table Name" : "Cube Table";
}

function getTableExcelHeader(type: TemplateType): string {
  return type === "general" ? "Table" : "Cube Table";
}

function createRow(id: number, cols: ColumnDef[]): GenericRow {
  const row: GenericRow = { id };
  cols.forEach((col) => { row[col.key] = col.selectOptions ? col.selectOptions[0] : ""; });
  return row;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FieldRequestForm({ provider = "claude" }: { provider?: AIProvider }) {
  const [templateType, setTemplateType]   = useState<TemplateType>("general");
  const [date, setDate]                   = useState(new Date().toISOString().split("T")[0]);
  const [tableName, setTableName]         = useState("");
  const [rows, setRows]                   = useState<GenericRow[]>(() => [createRow(1, GENERAL_COLUMNS)]);
  const [nextId, setNextId]               = useState(2);
  const [downloading, setDownloading]     = useState(false);
  const [generatingSql, setGeneratingSql] = useState(false);
  const [generatedSql, setGeneratedSql]   = useState("");
  const [sqlError, setSqlError]           = useState<string | null>(null);
  const [copiedSql, setCopiedSql]         = useState(false);
  const [fieldHistory, setFieldHistory]   = useState<FieldRequestEntry[]>([]);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);

  useEffect(() => { setFieldHistory(loadFieldHistory()); }, []);

  const columns = getColumns(templateType);
  const cardCols = templateType === "structured-note" ? "grid-cols-4" : "grid-cols-3";

  const handleTemplateChange = useCallback((type: TemplateType) => {
    const cols = getColumns(type);
    setTemplateType(type);
    setRows([createRow(1, cols)]);
    setNextId(2);
    setGeneratedSql("");
    setSqlError(null);
  }, []);

  const addRow = useCallback(() => {
    setRows((r) => [...r, createRow(nextId, getColumns(templateType))]);
    setNextId((n) => n + 1);
  }, [nextId, templateType]);

  const removeRow = useCallback((id: number) => {
    setRows((r) => r.length > 1 ? r.filter((row) => row.id !== id) : r);
  }, []);

  const duplicateRow = useCallback((id: number) => {
    setRows((r) => {
      const idx = r.findIndex((row) => row.id === id);
      if (idx === -1) return r;
      const copy = { ...r[idx] };
      const newRows = [...r];
      newRows.splice(idx + 1, 0, copy);
      // Re-assign IDs to keep them stable
      return newRows.map((row, i) => ({ ...row, id: i + 1 }));
    });
    setNextId((n) => n + 1);
  }, []);

  const updateRow = useCallback((id: number, key: string, value: string) => {
    setRows((r) => r.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }, []);

  const handleGenerateSql = useCallback(async () => {
    setSqlError(null);
    setGeneratedSql("");
    setGeneratingSql(true);
    try {
      const res = await fetch("/api/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName,
          provider,
          fields: rows.map((row) => ({
            fieldName:   String(row.field  || row.cubeObjectName || ""),
            format:      String(row.format     || ""),
            tooltip:     String(row.tooltip    || ""),
            comments:    String(row.comments   || row.patientExamples || ""),
            newRevised:  String(row.newRevised  || "New"),
            granularity: String(row.granularity || "Patient Level"),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSqlError(data.error ?? "Something went wrong."); return; }
      setGeneratedSql(data.sql);
    } catch {
      setSqlError("Network error — could not reach the server.");
    } finally {
      setGeneratingSql(false);
    }
  }, [tableName, rows]);

  const handleCopySql = useCallback(async () => {
    await navigator.clipboard.writeText(generatedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  }, [generatedSql]);

  // ─── Shared workbook builder ─────────────────────────────────────────────────
  const buildWorkbook = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "DAX & SQL Commenter App";
    wb.created = new Date();

    const ws = wb.addWorksheet("Field Request");

    const headerBg   = "FF1F3864";
    const headerFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    const bodyFont   = { name: "Calibri", size: 11 };
    const yellowFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFF00" } };
    const thinBorder = {
      top:    { style: "thin" as const, color: { argb: "FFD0D0D0" } },
      left:   { style: "thin" as const, color: { argb: "FFD0D0D0" } },
      bottom: { style: "thin" as const, color: { argb: "FFD0D0D0" } },
      right:  { style: "thin" as const, color: { argb: "FFD0D0D0" } },
    };

    ws.columns = [
      { width: 10 },
      { width: 18 },
      ...columns.map((col) => ({ width: col.excelWidth })),
    ];

    const allHeaders = ["Date", getTableExcelHeader(templateType), ...columns.map((c) => c.excelHeader)];
    const headerRow = ws.getRow(1);
    allHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerBg } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    });
    headerRow.height = 30;

    const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      month: "numeric", day: "numeric", year: "2-digit",
    });

    rows.forEach((row, idx) => {
      const exRow = ws.getRow(2 + idx);
      const maxLines = Math.max(
        ...columns
          .filter((c) => !c.selectOptions)
          .map((c) => Math.ceil((String(row[c.key] || "").length || 1) / (c.excelWidth ?? 40)))
      );
      exRow.height = Math.max(18, maxLines * 16);

      const isFirst = idx === 0;

      const dateCell = exRow.getCell(1);
      dateCell.value = isFirst ? formattedDate : "";
      dateCell.font = bodyFont;
      dateCell.alignment = { vertical: "middle" };
      dateCell.border = thinBorder;

      const tableCell = exRow.getCell(2);
      tableCell.value = isFirst ? tableName || "(table)" : "";
      tableCell.font = { ...bodyFont, bold: true };
      tableCell.alignment = { vertical: "middle" };
      tableCell.border = thinBorder;

      columns.forEach((col, colIdx) => {
        const cell = exRow.getCell(3 + colIdx);
        const val = String(row[col.key] || "");
        cell.value = val;
        cell.font = {
          ...bodyFont,
          bold: col.isYellow ? !!val : false,
          color: { argb: col.isYellow && val ? "FFCC0000" : "FF000000" },
        };
        cell.alignment = { vertical: "middle", wrapText: !col.selectOptions };
        cell.border = thinBorder;
        if (col.isYellow && val) cell.fill = yellowFill;
      });
    });

    if (generatedSql) {
      const sqlWs = wb.addWorksheet("Generated SQL");
      const titleCell = sqlWs.getCell("A1");
      titleCell.value = "Generated SQL";
      titleCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerBg } };
      titleCell.alignment = { horizontal: "left", vertical: "middle" };
      sqlWs.getRow(1).height = 24;
      const sqlCell = sqlWs.getCell("A2");
      sqlCell.value = generatedSql;
      sqlCell.font = { name: "Courier New", size: 10 };
      sqlCell.alignment = { wrapText: true, vertical: "top" };
      sqlWs.getColumn(1).width = 120;
      sqlWs.getRow(2).height = Math.min(500, generatedSql.split("\n").length * 15);
    }

    const templateLabel = templateType === "general" ? "General" : templateType === "quippe" ? "Quippe" : "StructuredNote";
    const safeTable = (tableName || "template").replace(/[^a-zA-Z0-9_]/g, "_");
    const safeDate  = date.replace(/-/g, ".");
    const filename = `Field_Request_${templateLabel}_${safeTable}_${safeDate}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer, filename };
  }, [date, tableName, rows, generatedSql, columns, templateType]);

  const saveToHistory = useCallback(() => {
    setFieldHistory((prev) =>
      addFieldHistoryEntry(prev, {
        templateType,
        tableName,
        date,
        rows: rows.map(({ id: _id, ...rest }) => rest),
      })
    );
  }, [templateType, tableName, date, rows]);

  // Saves a new history entry and marks it attached in a single atomic
  // functional update, so the "mark attached" step can't race against a
  // separate setFieldHistory call and tag the wrong entry.
  const attachToHistoryAndMark = useCallback((dashboardName: string) => {
    setFieldHistory((prev) => {
      const saved = addFieldHistoryEntry(prev, {
        templateType,
        tableName,
        date,
        rows: rows.map(({ id: _id, ...rest }) => rest),
      });
      return markFieldHistoryEntryAttached(saved, saved[0].id, dashboardName);
    });
  }, [templateType, tableName, date, rows]);

  // ─── Download to default Downloads folder ────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const { buffer, filename } = await buildWorkbook();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      saveToHistory();
    } finally {
      setDownloading(false);
    }
  }, [buildWorkbook, saveToHistory]);

  // ─── Save As — opens native file picker ──────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const { buffer, filename } = await buildWorkbook();

      if ("showSaveFilePicker" in window) {
        // Native file-picker (Chrome / Edge)
        const fileHandle = await (window as Window & { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> })
          .showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: "Excel Workbook",
              accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
            }],
          });
        const writable = await fileHandle.createWritable();
        await writable.write(buffer);
        await writable.close();
      } else {
        // Fallback for Firefox / Safari — same as Download
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      saveToHistory();
    } catch (err) {
      // AbortError = user clicked Cancel in the dialog — not an actual error
      if ((err as DOMException)?.name !== "AbortError") {
        console.error("Save failed:", err);
      }
    } finally {
      setSaving(false);
    }
  }, [buildWorkbook, saveToHistory]);

  const handleReset = useCallback(() => {
    setDate(new Date().toISOString().split("T")[0]);
    setTableName("");
    setRows([createRow(1, getColumns(templateType))]);
    setNextId(2);
    setGeneratedSql("");
    setSqlError(null);
  }, [templateType]);

  const handleHistorySelect = useCallback((entry: FieldRequestEntry) => {
    setTemplateType(entry.templateType as TemplateType);
    setDate(entry.date);
    setTableName(entry.tableName);
    const restoredRows = (entry.rows as GenericRow[]).map((r, i) => ({ ...r, id: i + 1 }));
    setRows(restoredRows);
    setNextId(restoredRows.length + 1);
    setGeneratedSql("");
    setSqlError(null);
  }, []);

  const handleHistoryDelete = useCallback((id: string) => {
    setFieldHistory((prev) => removeFieldHistoryEntry(prev, id));
  }, []);

  const handleHistoryClear = useCallback(() => {
    setFieldHistory([]);
  }, []);

  const hasSqlPanel = generatedSql || generatingSql;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-theme bg-secondary flex-shrink-0">
        <div className="flex items-center gap-2">
          <TableProperties className="w-4 h-4 text-secondary" />
          <span className="text-sm font-medium text-primary">New Field Request</span>
          <span className="text-xs text-secondary hidden sm:inline">— fill out, generate SQL, and download as Excel</span>
        </div>
        <div className="flex items-center gap-2">
          {/* History button */}
          <button
            onClick={() => setHistoryOpen(true)}
            title="Field request history"
            className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-theme text-secondary hover:text-primary hover:bg-panel transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            History
            {fieldHistory.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-brand-600 text-white">
                {fieldHistory.length > 9 ? "9+" : fieldHistory.length}
              </span>
            )}
          </button>

          <button onClick={handleReset} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-theme text-secondary hover:text-primary hover:bg-panel transition-colors">
            Clear
          </button>
          {templateType === "general" && (
            <button
              onClick={handleGenerateSql}
              disabled={generatingSql || !tableName.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {generatingSql
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                : <><Sparkles className="w-4 h-4" />Generate SQL</>}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || downloading}
            title="Choose where to save (opens file picker)"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <FolderOpen className="w-4 h-4" />
            {saving ? "Saving…" : "Save As…"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || saving}
            title="Download to default Downloads folder"
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 transition-all duration-200 shadow-sm"
          >
            <Download className="w-4 h-4" />
            {downloading ? "Generating…" : "Download Excel"}
          </button>
          <button
            onClick={() => setAttachModalOpen(true)}
            disabled={!tableName.trim()}
            title="Attach this field request to a dashboard"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <LayoutDashboard className="w-4 h-4" />
            Attach to Dashboard
          </button>
        </div>
      </div>

      {/* Body — split when SQL panel is active */}
      <div className="flex-1 overflow-hidden flex bg-primary">

        {/* Left: form */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

            {/* Template type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wide">Request Type</label>
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    { value: "general",         label: "General Request" },
                    { value: "quippe",          label: "Quippe Request" },
                    { value: "structured-note", label: "Structured Note Request" },
                  ] as { value: TemplateType; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleTemplateChange(value)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-150 ${
                      templateType === value
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "border-theme text-secondary hover:text-primary hover:bg-panel"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Meta fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-theme bg-secondary text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wide">{getTableLabel(templateType)}</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder={templateType === "general" ? "e.g. T1DM" : "e.g. DiabetesCube"}
                  className="px-3 py-2 rounded-lg border border-theme bg-secondary text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Field cards */}
            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div key={row.id} className="rounded-xl border border-theme bg-secondary p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-secondary uppercase tracking-wide">Field {idx + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => duplicateRow(row.id)}
                        title="Duplicate this field"
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                      >
                        <CopyPlus className="w-3 h-3" />
                        Duplicate
                      </button>
                      <button
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Remove field"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className={`grid ${cardCols} gap-3`}>
                    {columns.map((col) => (
                      <div key={col.key} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-secondary truncate" title={col.label}>{col.label}</label>
                        {col.selectOptions ? (
                          <select
                            value={String(row[col.key] ?? col.selectOptions[0])}
                            onChange={(e) => updateRow(row.id, col.key, e.target.value)}
                            className="px-2.5 py-1.5 rounded-md border border-theme bg-primary text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            {col.selectOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={String(row[col.key] ?? "")}
                            onChange={(e) => updateRow(row.id, col.key, e.target.value)}
                            placeholder={col.placeholder}
                            className={`px-2.5 py-1.5 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors ${
                              col.isYellow && String(row[col.key] ?? "")
                                ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 text-primary"
                                : "border-theme bg-primary text-primary"
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={addRow}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-secondary hover:text-brand-600 hover:bg-panel rounded-xl border border-dashed border-theme transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add field
              </button>
            </div>

            {/* SQL error */}
            {sqlError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-400">
                {sqlError}
              </div>
            )}

            <p className="text-xs text-secondary">
              The downloaded Excel matches your team template — columns match the selected request type.
              {generatedSql ? " Generated SQL is included on a second sheet." : ""}
            </p>
          </div>
        </div>

        {/* Right: sticky Generated SQL panel */}
        {hasSqlPanel && (
          <div className="w-[400px] flex-shrink-0 border-l border-theme flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-4 py-2.5 bg-panel border-b border-theme flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wide">Generated SQL</span>
              </div>
              {generatedSql && (
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-theme text-secondary hover:text-primary hover:bg-panel transition-colors"
                >
                  {copiedSql
                    ? <><Check className="w-3 h-3 text-green-500" />&nbsp;Copied!</>
                    : <><Copy className="w-3 h-3" />&nbsp;Copy</>}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-secondary">
              {generatingSql ? (
                <div className="flex items-center gap-2 text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                  <span className="text-sm">{provider === "gemini" ? "Gemini" : "Claude"} is generating the SQL…</span>
                </div>
              ) : (
                <pre className="text-sm font-mono text-primary whitespace-pre-wrap leading-relaxed">{generatedSql}</pre>
              )}
            </div>
            <div className="px-4 py-2 border-t border-theme bg-panel flex-shrink-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-600">
                Review before sending to your analyst · included in Excel export
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Field History drawer */}
      <FieldHistoryPanel
        entries={fieldHistory}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        onClearAll={handleHistoryClear}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      {/* Attach to Dashboard modal */}
      {attachModalOpen && (
        <AttachToDashboardModal
          entry={{
            id: "",
            timestamp: Date.now(),
            templateType,
            tableName,
            date,
            rows: rows.map(({ id: _id, ...rest }) => rest),
          }}
          onAttached={(dashboardName) => {
            attachToHistoryAndMark(dashboardName);
            setAttachModalOpen(false);
          }}
          onClose={() => setAttachModalOpen(false)}
        />
      )}
    </div>
  );
}
