import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  getMonthlySummaryData,
  formatReportDate,
  filterSummaryByDivisionIds,
} from "@/lib/monthly-summary";
import type { DivisionMonthlySummary } from "@/lib/brain-types";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const INVALID_SHEET_CHARS = /[\[\]:*?/\\]/g;
const MAX_SHEET_NAME_LENGTH = 31;

/**
 * Sanitizes a division name into a safe, unique Excel worksheet name.
 * Excel worksheet names must be <=31 chars and cannot contain [ ] : * ? / \.
 * `usedNames` tracks names already assigned so collisions get a " (2)",
 * " (3)", ... suffix instead of throwing or silently overwriting a sheet.
 */
function safeSheetName(rawName: string, usedNames: Set<string>): string {
  let base = (rawName || "Division").replace(INVALID_SHEET_CHARS, " ").trim();
  if (!base) base = "Division";
  if (base.length > MAX_SHEET_NAME_LENGTH) base = base.slice(0, MAX_SHEET_NAME_LENGTH).trim();

  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    const maxBaseLength = MAX_SHEET_NAME_LENGTH - suffixText.length;
    const truncatedBase = base.length > maxBaseLength ? base.slice(0, maxBaseLength).trim() : base;
    candidate = `${truncatedBase}${suffixText}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function buildSummarySheet(workbook: ExcelJS.Workbook, divisions: DivisionMonthlySummary[]): void {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Division", key: "division", width: 32 },
    { header: "New", key: "created", width: 12 },
    { header: "Completed", key: "completed", width: 14 },
    { header: "Net Open", key: "netOpen", width: 12 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  let totalCreated = 0;
  let totalCompleted = 0;

  for (const division of divisions) {
    sheet.addRow({
      division: division.name,
      created: division.created,
      completed: division.completed,
      netOpen: division.netOpen,
    });
    totalCreated += division.created;
    totalCompleted += division.completed;
  }

  const totalsRow = sheet.addRow({
    division: "Totals",
    created: totalCreated,
    completed: totalCompleted,
    netOpen: totalCreated - totalCompleted,
  });
  totalsRow.font = { bold: true };
}

function buildDivisionSheet(workbook: ExcelJS.Workbook, division: DivisionMonthlySummary, usedNames: Set<string>): void {
  const sheetName = safeSheetName(division.name, usedNames);
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: "Context", key: "context", width: 28 },
    { header: "Type", key: "type", width: 14 },
    { header: "Analyst", key: "analyst", width: 20 },
    { header: "Task", key: "task", width: 44 },
    { header: "Status", key: "status", width: 14 },
    { header: "Created", key: "created", width: 14 },
    { header: "Completed", key: "completed", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (const group of division.groups) {
    for (const task of group.tasks) {
      sheet.addRow({
        context: group.name,
        type: group.kind,
        analyst: group.analystName ?? "",
        task: task.title,
        status: task.status,
        created: formatReportDate(task.createdDate),
        completed: formatReportDate(task.completedDate),
      });
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const monthParam = req.nextUrl.searchParams.get("month");

    if (!monthParam || !MONTH_PATTERN.test(monthParam)) {
      return NextResponse.json({ error: "Invalid month. Expected format: YYYY-MM." }, { status: 400 });
    }

    const data = await getMonthlySummaryData(monthParam);

    const divisionsParam = req.nextUrl.searchParams.get("divisions");
    const { divisions, isFiltered } = filterSummaryByDivisionIds(data, divisionsParam);

    if (divisionsParam && divisions.length === 0) {
      return NextResponse.json({ error: "No matching divisions selected." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    buildSummarySheet(workbook, divisions);

    const usedNames = new Set<string>(["summary"]);
    for (const division of divisions) {
      buildDivisionSheet(workbook, division, usedNames);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}${isFiltered ? "-partial" : ""}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Monthly summary Excel export error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
