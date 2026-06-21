import type ExcelJS from "exceljs";

export interface ParsedFieldRow {
  date: string;
  newOrRevision: string;
  table: string;
  fieldName: string;
  format: string;
  tooltip: string;
}

export interface ParseFieldRequestResult {
  rows: ParsedFieldRow[];
  tableName: string;
}

type LogicalColumn =
  | "date"
  | "newOrRevision"
  | "table"
  | "fieldName"
  | "format"
  | "tooltip";

const HEADER_ALIASES: Record<LogicalColumn, string[]> = {
  date: ["date"],
  newOrRevision: ["new/revised", "new or revision", "new/revision"],
  table: ["table", "cube table", "table name"],
  fieldName: ["field", "field name", "cube object name"],
  format: ["format", "field format"],
  tooltip: ["tooltip", "tooltip (description)"],
};

const MAX_HEADER_SCAN_ROWS = 10;
const MAX_DATA_ROWS = 2000;
const MIN_HEADER_MATCHES = 3;

/** Normalize a string for alias comparison: trim, collapse internal whitespace, lowercase. */
function normalizeHeaderText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Find the logical column (if any) whose alias list contains the normalized text exactly. */
function matchLogicalColumn(normalizedText: string): LogicalColumn | null {
  if (!normalizedText) return null;
  for (const key of Object.keys(HEADER_ALIASES) as LogicalColumn[]) {
    if (HEADER_ALIASES[key].includes(normalizedText)) {
      return key;
    }
  }
  return null;
}

/** Extract plain text from an ExcelJS cell, handling strings, numbers, dates, rich text, and blanks. */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  if (
    typeof value === "object" &&
    "richText" in value &&
    Array.isArray((value as { richText?: unknown }).richText)
  ) {
    const richText = (value as { richText: Array<{ text: string }> }).richText;
    return richText.map((part) => part.text).join("");
  }
  return "";
}

interface HeaderDetectionResult {
  headerRowNumber: number;
  colMap: Partial<Record<LogicalColumn, number>>;
}

/** Scan the first rows of a worksheet to find the header row and build the column map. */
function detectHeaderRow(ws: ExcelJS.Worksheet): HeaderDetectionResult | null {
  const lastRow = Math.min(ws.rowCount, MAX_HEADER_SCAN_ROWS);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const colMap: Partial<Record<LogicalColumn, number>> = {};
    let matchCount = 0;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      if (!text) return;
      const normalized = normalizeHeaderText(text);
      const logicalColumn = matchLogicalColumn(normalized);
      if (logicalColumn) {
        matchCount++;
        if (colMap[logicalColumn] === undefined) {
          colMap[logicalColumn] = colNumber;
        }
      }
    });

    if (matchCount >= MIN_HEADER_MATCHES && colMap.fieldName !== undefined) {
      return { headerRowNumber: rowNumber, colMap };
    }
  }
  return null;
}

/** Read the text of a mapped logical column for a given row, or "" if unmapped/blank. */
function readMappedCell(
  row: ExcelJS.Row,
  colMap: Partial<Record<LogicalColumn, number>>,
  column: LogicalColumn
): string {
  const colNumber = colMap[column];
  if (colNumber === undefined) return "";
  return cellText(row.getCell(colNumber));
}

function extractRows(
  ws: ExcelJS.Worksheet,
  headerRowNumber: number,
  colMap: Partial<Record<LogicalColumn, number>>
): ParsedFieldRow[] {
  const rows: ParsedFieldRow[] = [];
  let lastDate = "";
  let lastTable = "";

  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = Math.min(ws.rowCount, headerRowNumber + MAX_DATA_ROWS);

  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber++) {
    const row = ws.getRow(rowNumber);

    const fieldNameText = readMappedCell(row, colMap, "fieldName");
    const dateText = readMappedCell(row, colMap, "date");
    const tableText = readMappedCell(row, colMap, "table");
    const newOrRevisionText = readMappedCell(row, colMap, "newOrRevision");
    const formatText = readMappedCell(row, colMap, "format");
    const tooltipText = readMappedCell(row, colMap, "tooltip");

    if (!fieldNameText.trim()) {
      const otherCellsBlank =
        !dateText.trim() &&
        !tableText.trim() &&
        !newOrRevisionText.trim() &&
        !formatText.trim() &&
        !tooltipText.trim();
      if (otherCellsBlank) {
        // End of data block.
        break;
      }
      // Stray formatting artifact row; skip but keep scanning.
      continue;
    }

    if (dateText.trim()) {
      lastDate = dateText;
    }
    if (tableText.trim()) {
      lastTable = tableText;
    }

    rows.push({
      date: dateText.trim() ? dateText : lastDate,
      newOrRevision: newOrRevisionText,
      table: tableText.trim() ? tableText : lastTable,
      fieldName: fieldNameText,
      format: formatText,
      tooltip: tooltipText,
    });
  }

  return rows;
}

function computeModeTableName(rows: ParsedFieldRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const table = row.table.trim();
    if (!table) continue;
    counts.set(table, (counts.get(table) ?? 0) + 1);
  }

  let bestTable = "";
  let bestCount = 0;
  for (const [table, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestTable = table;
    }
  }
  return bestTable;
}

function selectWorksheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  if (wb.worksheets.length === 0) {
    return null;
  }
  const preferred = wb.worksheets.find(
    (ws) => ws.name.trim().toLowerCase() === "field request"
  );
  return preferred ?? wb.worksheets[0];
}

/**
 * Parses an uploaded "Field Request" Excel file into structured rows.
 * Never throws: internal failures are logged via console.warn and result in `null`,
 * so callers can fail open (e.g. still attach the raw file even if parsing fails).
 */
export async function parseFieldRequestExcel(
  file: File
): Promise<ParseFieldRequestResult | null> {
  try {
    const ExcelJSModule = (await import("exceljs")).default;
    const wb = new ExcelJSModule.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const ws = selectWorksheet(wb);
    if (!ws) {
      return null;
    }

    const headerDetection = detectHeaderRow(ws);
    if (!headerDetection) {
      return null;
    }

    const { headerRowNumber, colMap } = headerDetection;
    const rows = extractRows(ws, headerRowNumber, colMap);
    if (rows.length === 0) {
      return null;
    }

    const tableName = computeModeTableName(rows);
    return { rows, tableName };
  } catch (error) {
    console.warn("parseFieldRequestExcel: failed to parse Excel file", error);
    return null;
  }
}

export function generateTitleFromParsedRows(
  result: ParseFieldRequestResult
): string {
  const { tableName, rows } = result;
  return `${tableName || "Unknown table"} — ${rows.length} field update${
    rows.length === 1 ? "" : "s"
  }`;
}

export function generateDescriptionFromParsedRows(
  result: ParseFieldRequestResult
): string {
  return result.rows
    .map(
      (row) =>
        `• ${row.newOrRevision || "Update"} — ${row.fieldName} (${
          row.format || "n/a"
        }): ${row.tooltip || "No description provided."}`
    )
    .join("\n");
}
