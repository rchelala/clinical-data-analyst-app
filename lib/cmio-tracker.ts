// Server-only module: builds/appends the CMIO's weekly-review Excel tracker
// (CMIO_Weekly_Review.xlsx) using ExcelJS. This is the highest-risk part of
// the CMIO Review feature — appendRowsToTracker must round-trip the CMIO's
// hand-edited workbook (styles, dropdowns, prior notes) without disturbing
// anything below the header row except the cells we explicitly write.

import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { ExtractedRow } from "@/lib/cmio-review-prompt";

const PRIORITY_NOTE = "Priority suggested by ClinKit — override as needed.";

interface ColumnMap {
  date: number;
  analyst: number;
  presentedBy: number;
  divisionTopic: number;
  actionItem: number;
  priority: number;
  status: number;
}

// ---------------------------------------------------------------------------
// Header detection / column mapping
// ---------------------------------------------------------------------------

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
}

function findHeaderRow(worksheet: ExcelJS.Worksheet): ExcelJS.Row {
  const maxScan = Math.min(worksheet.rowCount || 15, 15);
  for (let r = 1; r <= maxScan; r++) {
    const row = worksheet.getRow(r);
    let found = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (normalizeHeaderText(cell.value).startsWith("action item")) {
        found = true;
      }
    });
    if (found) return row;
  }
  throw new Error("Couldn't find the tracker's header row — is this the CMIO_Weekly_Review workbook?");
}

function mapColumns(headerRow: ExcelJS.Row): ColumnMap {
  const map: Partial<ColumnMap> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = normalizeHeaderText(cell.value);
    if (text === "date") map.date = colNumber;
    else if (text === "analyst") map.analyst = colNumber;
    else if (text === "presented by") map.presentedBy = colNumber;
    else if (text === "division / topic") map.divisionTopic = colNumber;
    else if (text.startsWith("action item")) map.actionItem = colNumber;
    else if (text === "priority") map.priority = colNumber;
    else if (text === "status") map.status = colNumber;
  });

  const required: Array<[keyof ColumnMap, string]> = [
    ["date", "Date"],
    ["analyst", "Analyst"],
    ["presentedBy", "Presented by"],
    ["divisionTopic", "Division / Topic"],
    ["actionItem", "Action item"],
    ["priority", "Priority"],
    ["status", "Status"],
  ];
  for (const [key, label] of required) {
    if (!map[key]) {
      throw new Error(`Couldn't find the "${label}" column in the tracker's header row.`);
    }
  }
  return map as ColumnMap;
}

function findFirstFreeRow(worksheet: ExcelJS.Worksheet, headerRowNumber: number, columns: ColumnMap): number {
  let r = headerRowNumber + 1;
  const maxRow = Math.max(worksheet.rowCount || 0, headerRowNumber + 1);
  while (r <= maxRow) {
    const row = worksheet.getRow(r);
    const actionText = String(row.getCell(columns.actionItem).value ?? "").trim();
    const dateVal = row.getCell(columns.date).value;
    const isExample = /^example/i.test(actionText);
    const hasDate = dateVal !== null && dateVal !== undefined && dateVal !== "";
    const hasAction = actionText.length > 0;
    if (!isExample && !hasDate && !hasAction) {
      return r;
    }
    r++;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Row writing
// ---------------------------------------------------------------------------

function toLocalNoonDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  return new Date(y, m - 1, d, 12);
}

function writeMappedRow(row: ExcelJS.Row, columns: ColumnMap, data: ExtractedRow): void {
  row.getCell(columns.date).value = toLocalNoonDate(data.date);
  row.getCell(columns.analyst).value = data.analyst;
  row.getCell(columns.presentedBy).value = data.presenter ?? "";
  row.getCell(columns.divisionTopic).value = data.topic;

  const actionCell = row.getCell(columns.actionItem);
  actionCell.value = data.action;
  actionCell.note = data.source;

  const priorityCell = row.getCell(columns.priority);
  priorityCell.value = data.priority;
  priorityCell.note = PRIORITY_NOTE;

  row.getCell(columns.status).value = data.status;
}

// ---------------------------------------------------------------------------
// Defensive fixup: some tracker files in the wild store cell-note ("comment")
// parts at a non-standard OPC path (e.g. "xl/comments/comment1.xml" instead
// of "xl/commentsN.xml"). That layout is valid per the OOXML spec, but
// ExcelJS 4.4.0's reader only recognizes the "xl/commentsN.xml" pattern and
// throws while reconciling worksheet relationships if it sees anything else.
// We normalize those parts to the path ExcelJS expects before handing the
// buffer to `wb.xlsx.load()`, so a legacy/externally-produced tracker (like
// the one this feature seeds from) doesn't crash the whole append. Files
// that are already in the standard layout pass through untouched.
// ---------------------------------------------------------------------------

// ExcelJS's reader keys parsed comment/VML parts into internal dictionaries
// using a hardcoded literal convention (e.g. "../comments1.xml"), and only
// recognizes those parts in the first place if their zip entry name matches
// a hardcoded pattern (e.g. "xl/commentsN.xml"). A relationship whose Target
// doesn't resolve to that exact literal — even if it's a perfectly valid,
// spec-compliant OPC path — makes the reader crash. Also, ExcelJS's comment
// text parser only recognizes rich-text runs ("<text><r><t>...") and silently
// drops bare "<text><t>...</t></text>" content with no wrapping "<r>". Each
// kind below re-homes the relevant part to the literal path/Target ExcelJS
// expects, and (for comments) upgrades bare text runs so existing notes
// survive with their text intact.
interface CommentsRelKind {
  type: string;
  pattern: RegExp;
  makeName: (n: number) => string;
  makeTarget: (n: number) => string;
  fixContent?: (xml: string) => string;
}

const REL_KINDS: CommentsRelKind[] = [
  {
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
    pattern: /^xl\/comments(\d+)\.xml$/i,
    makeName: (n) => `xl/comments${n}.xml`,
    makeTarget: (n) => `../comments${n}.xml`,
    fixContent: (xml) =>
      xml
        .replace(/<text><t(\s[^>]*)?>/g, "<text><r><t$1>")
        .replace(/<\/t><\/text>/g, "</t></r></text>"),
  },
  {
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing",
    pattern: /^xl\/drawings\/vmlDrawing(\d+)\.vml$/i,
    makeName: (n) => `xl/drawings/vmlDrawing${n}.vml`,
    makeTarget: (n) => `../drawings/vmlDrawing${n}.vml`,
  },
];

function resolveRelTarget(ownerDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseParts = ownerDir.split("/").filter(Boolean);
  for (const part of target.split("/")) {
    if (part === "..") baseParts.pop();
    else if (part === "." || part === "") continue;
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

async function normalizeCommentsLayout(buffer: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    // Not a zip we can safely inspect — let ExcelJS's own loader surface the real error.
    return buffer;
  }

  const relsFiles = Object.keys(zip.files).filter((name) =>
    /^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(name)
  );
  if (relsFiles.length === 0) return buffer;

  const usedNumbers = new Map<string, Set<number>>();
  const counters = new Map<string, number>();
  for (const kind of REL_KINDS) {
    usedNumbers.set(kind.type, new Set());
    counters.set(kind.type, 1);
  }
  for (const name of Object.keys(zip.files)) {
    for (const kind of REL_KINDS) {
      const m = name.match(kind.pattern);
      if (m) usedNumbers.get(kind.type)!.add(Number(m[1]));
    }
  }
  const nextFreeNumber = (type: string): number => {
    const used = usedNumbers.get(type)!;
    let n = counters.get(type)!;
    while (used.has(n)) n++;
    used.add(n);
    counters.set(type, n);
    return n;
  };

  const renames: Array<{ oldPath: string; newPath: string }> = [];
  const contentFixTargets = new Set<string>();
  let changed = false;

  for (const relsPath of relsFiles) {
    const relsFile = zip.file(relsPath);
    if (!relsFile) continue;
    let relsXml = await relsFile.async("string");
    const ownerDir = relsPath.replace(/\/_rels\/[^/]+\.rels$/i, "");

    const relRegex = /<Relationship\b[^>]*\/>/g;
    const replacements: Array<{ from: string; to: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = relRegex.exec(relsXml))) {
      const tag = match[0];
      const kind = REL_KINDS.find((k) => tag.includes(k.type));
      if (!kind) continue;
      const targetMatch = tag.match(/Target="([^"]+)"/);
      if (!targetMatch) continue;
      const target = targetMatch[1];
      const oldZipPath = resolveRelTarget(ownerDir, target);
      const oldFile = zip.file(oldZipPath);
      if (!oldFile) continue;

      if (kind.fixContent) contentFixTargets.add(oldZipPath);

      const existingMatch = oldZipPath.match(kind.pattern);
      const num = existingMatch ? Number(existingMatch[1]) : nextFreeNumber(kind.type);
      const newZipPath = kind.makeName(num);
      const expectedTarget = kind.makeTarget(num);

      if (newZipPath === oldZipPath && target === expectedTarget) continue; // already correct

      if (newZipPath !== oldZipPath) {
        renames.push({ oldPath: oldZipPath, newPath: newZipPath });
      }
      if (target !== expectedTarget) {
        replacements.push({ from: tag, to: tag.replace(`Target="${target}"`, `Target="${expectedTarget}"`) });
      }
      changed = true;
    }

    if (replacements.length > 0) {
      for (const { from, to } of replacements) {
        relsXml = relsXml.replace(from, to);
      }
      zip.file(relsPath, relsXml);
    }
  }

  if (!changed && contentFixTargets.size === 0) return buffer;

  for (const { oldPath, newPath } of renames) {
    const oldFile = zip.file(oldPath);
    if (!oldFile) continue;
    const content = await oldFile.async("nodebuffer");
    zip.file(newPath, content);
    zip.remove(oldPath);
  }

  const renameMap = new Map(renames.map((r) => [r.oldPath, r.newPath]));
  const commentsKind = REL_KINDS.find((k) => k.fixContent)!;
  for (const oldPath of contentFixTargets) {
    const finalPath = renameMap.get(oldPath) ?? oldPath;
    const file = zip.file(finalPath);
    if (!file) continue;
    const xml = await file.async("string");
    const fixed = commentsKind.fixContent!(xml);
    if (fixed !== xml) {
      zip.file(finalPath, fixed);
      changed = true;
    }
  }

  if (renames.length > 0) {
    const contentTypesFile = zip.file("[Content_Types].xml");
    if (contentTypesFile) {
      let contentTypesXml = await contentTypesFile.async("string");
      for (const { oldPath, newPath } of renames) {
        contentTypesXml = contentTypesXml.split(`PartName="/${oldPath}"`).join(`PartName="/${newPath}"`);
      }
      zip.file("[Content_Types].xml", contentTypesXml);
    }
  }

  if (!changed) return buffer;
  return zip.generateAsync({ type: "nodebuffer" });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Appends rows into the CMIO's existing weekly-review tracker without
 * rebuilding the sheet, preserving the CMIO's prior edits, styles, and the
 * Priority/Status dropdown validations.
 */
export async function appendRowsToTracker(
  workbookBuffer: ArrayBuffer | Buffer,
  rows: ExtractedRow[]
): Promise<Buffer> {
  const inputBuffer = Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(workbookBuffer);
  const normalizedBuffer = await normalizeCommentsLayout(inputBuffer);

  const workbook = new ExcelJS.Workbook();
  // Two @types/node versions are present in this repo's dependency tree (a nested
  // one shipped by another package), which makes Node's ambient `Buffer` type
  // resolve inconsistently across files. Passing a plain ArrayBuffer sidesteps
  // it — the same pattern already used elsewhere in this codebase for
  // `workbook.xlsx.load()` (see lib/parseFieldRequestExcel.ts).
  const loadableBuffer = normalizedBuffer.buffer.slice(
    normalizedBuffer.byteOffset,
    normalizedBuffer.byteOffset + normalizedBuffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(loadableBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Couldn't find the tracker's header row — is this the CMIO_Weekly_Review workbook?");
  }

  const headerRow = findHeaderRow(worksheet);
  const columns = mapColumns(headerRow);

  let nextRowNumber = findFirstFreeRow(worksheet, headerRow.number, columns);
  for (const data of rows) {
    const row = worksheet.getRow(nextRowNumber);
    writeMappedRow(row, columns, data);
    nextRowNumber++;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Read-only preview of the held tracker's current contents
// ---------------------------------------------------------------------------

export interface TrackerDisplayRow {
  date: string; // "YYYY-MM-DD" (empty string if blank/unparseable)
  analyst: string;
  presenter: string;
  topic: string;
  action: string;
  priority: string; // raw cell text ("High"/"Medium"/"Low" or "")
  status: string; // raw cell text
  cmioComment: string; // the CMIO comment column, READ-ONLY display (may be "")
}

interface DisplayColumnMap {
  date?: number;
  analyst?: number;
  presentedBy?: number;
  divisionTopic?: number;
  actionItem?: number;
  priority?: number;
  status?: number;
  cmioComment?: number;
}

function mapDisplayColumns(headerRow: ExcelJS.Row): DisplayColumnMap {
  const map: DisplayColumnMap = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = normalizeHeaderText(cell.value);
    if (text === "date") map.date = colNumber;
    else if (text === "analyst") map.analyst = colNumber;
    else if (text === "presented by") map.presentedBy = colNumber;
    else if (text === "division / topic") map.divisionTopic = colNumber;
    else if (text.startsWith("action item")) map.actionItem = colNumber;
    else if (text === "priority") map.priority = colNumber;
    else if (text === "status") map.status = colNumber;
    else if (text === "cmio comment" || text.startsWith("cmio comment")) map.cmioComment = colNumber;
  });
  return map;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Mirrors the `toDateOnlyString` helper in app/api/cmio-review/step/route.ts —
// local date parts, never `.toISOString()`, to avoid a UTC-shifted day.
function formatDisplayDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function cellText(row: ExcelJS.Row, colNumber: number | undefined): string {
  if (!colNumber) return "";
  return String(row.getCell(colNumber).value ?? "").trim();
}

/**
 * Reads the held tracker's current rows for a read-only UI preview. Degrades
 * gracefully (returns []) rather than throwing when the workbook has no
 * usable sheet/columns — callers should still surface a real parse failure
 * (e.g. a non-tracker file) via `findHeaderRow`'s thrown error.
 */
export async function readTrackerRows(workbookBuffer: ArrayBuffer | Buffer): Promise<TrackerDisplayRow[]> {
  const inputBuffer = Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(workbookBuffer);
  const normalizedBuffer = await normalizeCommentsLayout(inputBuffer);

  const workbook = new ExcelJS.Workbook();
  const loadableBuffer = normalizedBuffer.buffer.slice(
    normalizedBuffer.byteOffset,
    normalizedBuffer.byteOffset + normalizedBuffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(loadableBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = findHeaderRow(worksheet);
  const columns = mapDisplayColumns(headerRow);
  if (!columns.actionItem) return [];

  const results: TrackerDisplayRow[] = [];
  for (let r = headerRow.number + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const actionText = cellText(row, columns.actionItem);
    const dateText = formatDisplayDate(columns.date ? row.getCell(columns.date).value : undefined);
    const analystText = cellText(row, columns.analyst);

    if (/^example/i.test(actionText)) continue;
    if (!dateText && !actionText && !analystText) continue;

    results.push({
      date: dateText,
      analyst: analystText,
      presenter: cellText(row, columns.presentedBy),
      topic: cellText(row, columns.divisionTopic),
      action: actionText,
      priority: cellText(row, columns.priority),
      status: cellText(row, columns.status),
      cmioComment: cellText(row, columns.cmioComment),
    });
  }

  return results;
}

/** Builds a fresh standalone tracker workbook containing only the given rows. */
export async function buildStandaloneTracker(rows: ExtractedRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("CMIO Review");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Analyst", key: "analyst", width: 20 },
    { header: "Presented by", key: "presentedBy", width: 20 },
    { header: "Division / Topic", key: "topic", width: 28 },
    { header: "Action item (from meeting)", key: "action", width: 48 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "CMIO comment", key: "cmioComment", width: 32 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  sheet.getColumn("date").numFmt = "mm/dd/yyyy";

  for (const data of rows) {
    const row = sheet.addRow({
      date: toLocalNoonDate(data.date),
      analyst: data.analyst,
      presentedBy: data.presenter ?? "",
      topic: data.topic,
      action: data.action,
      priority: data.priority,
      status: data.status,
      cmioComment: "",
    });

    const actionCell = row.getCell("action");
    actionCell.note = data.source;

    const priorityCell = row.getCell("priority");
    priorityCell.note = PRIORITY_NOTE;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
