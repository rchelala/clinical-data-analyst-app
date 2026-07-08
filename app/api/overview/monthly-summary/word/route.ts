import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
} from "docx";
import { getMonthlySummaryData, monthLabel } from "@/lib/monthly-summary";
import type { DivisionMonthlySummary, MonthlyGroup, MonthlyTaskRow } from "@/lib/brain-types";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const BLUE = "2E75B6";
const PURPLE = "7030A0";
const GRAY = "666666";

function totalsParagraph(divisions: number, created: number, completed: number, netOpen: number): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `Divisions: ${divisions}   |   New: ${created}   |   Completed: ${completed}   |   Net open: ${netOpen}`,
        font: "Arial",
        size: 20,
        color: GRAY,
      }),
    ],
    spacing: { after: 240 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE },
    },
  });
}

function divisionHeading(division: DivisionMonthlySummary): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [
      new TextRun({
        text: `${division.name}  `,
        bold: true,
        color: PURPLE,
        font: "Arial",
        size: 32,
      }),
      new TextRun({
        text: `(New: ${division.created}, Completed: ${division.completed}, Net open: ${division.netOpen})`,
        italics: true,
        color: GRAY,
        font: "Arial",
        size: 20,
      }),
    ],
    spacing: { before: 240, after: 120 },
  });
}

function groupHeading(group: MonthlyGroup): Paragraph {
  const text = group.analystName ? `${group.name} — ${group.analystName}` : group.name;
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [
      new TextRun({
        text,
        bold: true,
        color: BLUE,
        font: "Arial",
        size: 24,
      }),
    ],
    spacing: { before: 160, after: 80 },
  });
}

function taskBullet(task: MonthlyTaskRow): Paragraph {
  const parts: string[] = [task.title];
  if (task.ownerName) parts.push(`Owner: ${task.ownerName}`);
  parts.push(`Status: ${task.status}`);
  if (task.createdDate) parts.push(`Created: ${task.createdDate}`);
  if (task.completedDate) parts.push(`Completed: ${task.completedDate}`);

  return new Paragraph({
    bullet: { level: 0 },
    children: [
      new TextRun({ text: parts.join("  |  "), font: "Arial", size: 20 }),
    ],
    spacing: { after: 60 },
  });
}

function buildDocument(month: string, data: Awaited<ReturnType<typeof getMonthlySummaryData>>): Document {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: `Monthly Summary — ${monthLabel(month)}`,
          bold: true,
          color: PURPLE,
          font: "Arial",
          size: 44,
        }),
      ],
      spacing: { after: 120 },
    }),
    totalsParagraph(data.totals.divisions, data.totals.created, data.totals.completed, data.totals.netOpen),
  ];

  if (data.divisions.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "No activity this month.", italics: true, font: "Arial", size: 22 })],
        spacing: { before: 120 },
      })
    );
  } else {
    for (const division of data.divisions) {
      children.push(divisionHeading(division));
      for (const group of division.groups) {
        children.push(groupHeading(group));
        for (const task of group.tasks) {
          children.push(taskBullet(task));
        }
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
}

export async function GET(req: NextRequest) {
  try {
    const monthParam = req.nextUrl.searchParams.get("month");

    if (!monthParam || !MONTH_PATTERN.test(monthParam)) {
      return NextResponse.json({ error: "Invalid month. Expected format: YYYY-MM." }, { status: 400 });
    }

    const data = await getMonthlySummaryData(monthParam);
    const doc = buildDocument(monthParam, data);
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="monthly-summary-${monthParam}.docx"`,
      },
    });
  } catch (err) {
    console.error("Monthly summary Word export error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
