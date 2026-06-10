import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  TabStopType,
  PageOrientation,
  convertInchesToTwip,
} from "docx";

const BLUE = "2E75B6";
const PURPLE = "7030A0";
const GRAY_PLACEHOLDER = "AAAAAA";
const LIGHT_GRAY = "F2F2F2";
const WHITE = "FFFFFF";

const EXTRACTION_PROMPT = `You are a SQL Server code analyst. Parse the provided SQL (view or stored procedure) and extract metadata. Return ONLY valid JSON — no markdown, no explanation.

Return this exact shape (use "[placeholder]" for any field you cannot determine from the SQL):
{
  "objectName": "short name of the object, no schema prefix",
  "objectType": "view or procedure",
  "dashboardName": "human-readable dashboard name inferred from object name or comments",
  "createdDate": "date from revision history comment or [placeholder]",
  "updatedDate": "most recent date in revision history or [placeholder]",
  "requestedBy": "person named in comments or [placeholder]",
  "stakeholder": "stakeholder named in comments or [placeholder]",
  "refreshCadence": "if GETDATE() or scheduler hints present say 'daily'; else [placeholder]",
  "viewFullName": "3-part name if CREATE/ALTER VIEW, else null",
  "spFullName": "3-part name if CREATE/ALTER PROCEDURE, else null",
  "cube": "cube name from comments or [placeholder]",
  "patientPopulation": ["each distinct population segment or filter description as a string"],
  "lookbackPeriod": "date range from DATEADD in WHERE clause or [placeholder]",
  "notesCaptured": ["each DocumentName filter value"],
  "observationItems": ["each item from ocmi.name IN (...) lists"],
  "orders": ["each order name from o.Name LIKE or = patterns"],
  "orderSets": ["order set references or null if none"],
  "emailsRS": ["RS/SSRS report or email SP references or null if none"],
  "tables": {
    "DatabaseName": ["fully.qualified.TableName", "..."],
    "AnotherDB": ["fully.qualified.ViewName"]
  }
}

Rules:
- tables: scan every FROM, JOIN, LEFT JOIN, OUTER APPLY. Group by the first part of the 3-part name. De-duplicate. Sort alphabetically within each group. Exclude temp tables (#...) and CTEs.
- patientPopulation: list the primary visit/patient table + any TypeCode/ICD10 filters + population segment CASE expressions as separate readable strings.
- If a string array field has no values, use an empty array [].
- Do not include SQL keywords, backticks, or extra commentary.

SQL to parse:`;

interface ExtractedData {
  objectName: string;
  objectType: string;
  dashboardName: string;
  createdDate: string;
  updatedDate: string;
  requestedBy: string;
  stakeholder: string;
  refreshCadence: string;
  viewFullName: string | null;
  spFullName: string | null;
  cube: string;
  patientPopulation: string[];
  lookbackPeriod: string;
  notesCaptured: string[];
  observationItems: string[];
  orders: string[];
  orderSets: string[] | null;
  emailsRS: string[] | null;
  tables: Record<string, string[]>;
}

function isPlaceholder(val: string | null | undefined): boolean {
  if (!val) return true;
  return val.trim().startsWith("[") && val.trim().endsWith("]");
}

function valueRun(val: string): TextRun {
  if (isPlaceholder(val)) {
    return new TextRun({ text: val, italics: true, color: GRAY_PLACEHOLDER, font: "Arial", size: 20 });
  }
  return new TextRun({ text: val, font: "Arial", size: 20 });
}

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BLUE, font: "Arial", size: 24 })],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE },
    },
    spacing: { before: 240, after: 120 },
  });
}

function labelValueParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}:  `, bold: true, font: "Arial", size: 20 }),
      valueRun(value),
    ],
    spacing: { after: 60 },
  });
}

function subItemParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, font: "Arial", size: 20 })],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { after: 40 },
  });
}

function blueTableHeaderCell(text: string, widthDxa: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, font: "Arial", size: 18 })],
        alignment: AlignmentType.LEFT,
      }),
    ],
    shading: { type: ShadingType.CLEAR, color: "auto", fill: BLUE },
    width: { size: widthDxa, type: WidthType.DXA },
  });
}

function dataCell(text: string, fill: string, widthDxa: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: "Arial", size: 18 })],
      }),
    ],
    shading: { type: ShadingType.CLEAR, color: "auto", fill },
    width: { size: widthDxa, type: WidthType.DXA },
  });
}

function buildTablesSection(tables: Record<string, string[]>): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const dbs = Object.keys(tables).sort();

  for (const db of dbs) {
    const rows = tables[db].sort();
    if (rows.length === 0) continue;

    elements.push(
      new Paragraph({
        children: [new TextRun({ text: `Database:  ${db}`, bold: true, font: "Arial", size: 20 })],
        spacing: { before: 160, after: 60 },
      })
    );

    const colW1 = 2520;
    const colW2 = 7020;

    const headerRow = new TableRow({
      children: [
        blueTableHeaderCell("Database", colW1),
        blueTableHeaderCell("Table / Object", colW2),
      ],
      tableHeader: true,
    });

    const dataRows = rows.map((row, idx) => {
      const fill = idx % 2 === 0 ? WHITE : LIGHT_GRAY;
      return new TableRow({
        children: [
          dataCell(db, fill, colW1),
          dataCell(row, fill, colW2),
        ],
      });
    });

    elements.push(
      new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 9540, type: WidthType.DXA },
        columnWidths: [colW1, colW2],
      })
    );
  }

  return elements;
}

function buildDocument(d: ExtractedData): Document {
  const margin = 900;

  // Header metadata row with tab stops
  const tabStops = [
    { type: TabStopType.LEFT, position: 2160 },
    { type: TabStopType.LEFT, position: 4680 },
    { type: TabStopType.LEFT, position: 7200 },
  ];

  const metaRow = new Paragraph({
    tabStops,
    children: [
      new TextRun({ text: "Created in:  ", bold: true, font: "Arial", size: 20 }),
      valueRun(d.createdDate),
      new TextRun({ text: "\tUpdated Last:  ", bold: true, font: "Arial", size: 20 }),
      valueRun(d.updatedDate),
      new TextRun({ text: "\tRequested By:  ", bold: true, font: "Arial", size: 20 }),
      valueRun(d.requestedBy),
      new TextRun({ text: "\tCurrent Stakeholder:  ", bold: true, font: "Arial", size: 20 }),
      valueRun(d.stakeholder),
    ],
    spacing: { after: 120 },
  });

  const cadenceText = isPlaceholder(d.refreshCadence)
    ? d.refreshCadence
    : `Data is refreshed ${d.refreshCadence}`;

  const cadencePara = new Paragraph({
    children: [
      new TextRun({ text: cadenceText, color: PURPLE, font: "Arial", size: 20 }),
    ],
    spacing: { after: 160 },
  });

  const divider = new Paragraph({
    children: [],
    border: {
      bottom: { style: BorderStyle.THICK, size: 12, color: BLUE },
    },
    spacing: { after: 240 },
  });

  // Data Sources
  const sourceParagraphs: Paragraph[] = [];

  if (d.viewFullName) sourceParagraphs.push(labelValueParagraph("View", d.viewFullName));
  if (d.spFullName) sourceParagraphs.push(labelValueParagraph("Stored Procedure", d.spFullName));
  if (!d.viewFullName && !d.spFullName) {
    sourceParagraphs.push(labelValueParagraph("View / Stored Procedure", "[placeholder]"));
  }

  sourceParagraphs.push(labelValueParagraph("Cube", d.cube));

  sourceParagraphs.push(
    new Paragraph({
      children: [new TextRun({ text: "Patient Population:  ", bold: true, font: "Arial", size: 20 })],
      spacing: { after: 40 },
    })
  );
  if (d.patientPopulation.length > 0) {
    d.patientPopulation.forEach((p) => sourceParagraphs.push(subItemParagraph(p)));
  } else {
    sourceParagraphs.push(subItemParagraph("[placeholder]"));
  }

  sourceParagraphs.push(labelValueParagraph("Look-back Period", d.lookbackPeriod));

  const notesVal =
    d.notesCaptured.length > 0 ? d.notesCaptured.join(" | ") : "[placeholder]";
  const notesWithObs =
    d.observationItems.length > 0
      ? `${notesVal}  |  ${d.observationItems.join(" | ")}`
      : notesVal;
  sourceParagraphs.push(labelValueParagraph("Notes Captured", notesWithObs));

  const ordersVal = d.orders.length > 0 ? d.orders.join(", ") : "[placeholder]";
  sourceParagraphs.push(labelValueParagraph("Orders / Consults", ordersVal));

  const orderSetsVal =
    d.orderSets && d.orderSets.length > 0 ? d.orderSets.join(", ") : "N/A";
  sourceParagraphs.push(labelValueParagraph("Order Sets", orderSetsVal));

  const emailsVal =
    d.emailsRS && d.emailsRS.length > 0 ? d.emailsRS.join(", ") : "[placeholder]";
  sourceParagraphs.push(labelValueParagraph("Emails / RS", emailsVal));

  const tableElements = buildTablesSection(d.tables);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children: [
          // Dashboard title
          new Paragraph({
            children: [
              new TextRun({ text: d.dashboardName, bold: true, color: PURPLE, font: "Arial", size: 56 }),
            ],
            spacing: { after: 120 },
          }),
          metaRow,
          cadencePara,
          divider,
          sectionHeader("Data Sources"),
          ...sourceParagraphs,
          sectionHeader("Database Tables, SPs and Views"),
          ...(tableElements as Paragraph[]),
        ],
      },
    ],
  });

  return doc;
}

export async function POST(req: NextRequest) {
  try {
    const { sql } = await req.json() as { sql: string };
    if (!sql?.trim()) {
      return NextResponse.json({ error: "No SQL provided." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n${sql}`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip markdown fences if Claude wrapped the JSON
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const data: ExtractedData = JSON.parse(jsonText);

    const doc = buildDocument(data);
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    const safeName = (data.objectName || "Document").replace(/[^a-zA-Z0-9_-]/g, "_");

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="IT_Reference_${safeName}.docx"`,
        "X-Object-Name": safeName,
      },
    });
  } catch (err) {
    console.error("IT Reference error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate IT Reference document." },
      { status: 500 }
    );
  }
}
