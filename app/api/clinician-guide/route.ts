import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  AlignmentType,
  convertInchesToTwip,
  PageOrientation,
} from "docx";
import { parsePbixFile, PbixDashboard } from "@/lib/pbix-parser";

const BLUE = "2E75B6";
const PURPLE = "7030A0";
const TEAL = "0070C0";
const LIGHT_GRAY = "F2F2F2";

const VISUAL_TYPE_LABELS: Record<string, string> = {
  barChart: "Bar Chart",
  clusteredBarChart: "Clustered Bar Chart",
  columnChart: "Column Chart",
  clusteredColumnChart: "Clustered Column Chart",
  lineChart: "Line Chart",
  areaChart: "Area Chart",
  stackedAreaChart: "Stacked Area Chart",
  comboChart: "Combo Chart",
  pieChart: "Pie Chart",
  donutChart: "Donut Chart",
  treemap: "Treemap",
  funnel: "Funnel Chart",
  scatterChart: "Scatter Chart",
  waterfallChart: "Waterfall Chart",
  ribbonChart: "Ribbon Chart",
  tableEx: "Table",
  pivotTable: "Matrix / Pivot Table",
  card: "KPI Card",
  multiRowCard: "Multi-Row Card",
  slicer: "Filter / Slicer",
  advancedSlicerVisual: "Filter / Slicer",
  map: "Map",
  filledMap: "Filled Map",
  azureMap: "Azure Map",
  shapeMap: "Shape Map",
  gauge: "Gauge",
  kpi: "KPI Indicator",
  image: "Image",
  textbox: "Text Box",
  shape: "Shape / Divider",
  actionButton: "Button",
  bookmarkNavigator: "Bookmark Navigator",
  pageNavigator: "Page Navigator",
  qnaVisual: "Q&A Visual",
  pythonVisual: "Python Visual",
  rVisual: "R Visual",
  decompositionTree: "Decomposition Tree",
  keyInfluencers: "Key Influencers",
  smartNarrativeVisual: "Smart Narrative",
};

function friendlyVisualType(type: string): string {
  return VISUAL_TYPE_LABELS[type] ?? type;
}

function buildPrompt(dashboard: PbixDashboard): string {
  const pagesJson = dashboard.pages.map((p) => ({
    pageName: p.name,
    visuals: p.visuals.map((v) => ({
      type: friendlyVisualType(v.type),
      title: v.title ?? null,
    })),
  }));

  return `You are writing a plain-language guide for clinical staff (nurses, physicians, care coordinators) who will use a Power BI dashboard. They are NOT technical — avoid any mention of databases, SQL, data models, or Power BI internals. Write as if explaining to a smart colleague who has never seen the dashboard before.

Given the dashboard structure below, return ONLY valid JSON — no markdown, no explanation.

Return this exact shape:
{
  "reportTitle": "A clean, human-readable title for this dashboard (infer from report name and page names)",
  "overview": "2–3 sentences explaining what this dashboard does and who would use it. Use plain language.",
  "pages": [
    {
      "name": "exact page name from input",
      "purpose": "1–2 sentences: what question does this page answer? What would a clinician look at here?",
      "visuals": [
        {
          "label": "A human-friendly name for this visual (use the title if available, otherwise describe it by its type and apparent purpose)",
          "explains": "1 sentence: what does this chart or table show? What can the clinician learn from it?"
        }
      ]
    }
  ]
}

Rules:
- Never use technical terms like "slicer", "DAX", "SQL", "dataset", "query", "visualType", "Power BI model"
- Replace "Slicer" / "Filter" visuals with plain language like "dropdown filter" or "date selector"
- Replace "tableEx" with "data table", "card" with "summary number", "KPI" with "goal tracker"
- If a page has no visuals worth describing, still include it with a helpful purpose description
- Keep all text concise — clinicians are busy

Dashboard to analyze:
${JSON.stringify({ reportName: dashboard.reportName, pages: pagesJson }, null, 2)}`;
}

interface ClinicianVisual {
  label: string;
  explains: string;
}

interface ClinicianPage {
  name: string;
  purpose: string;
  visuals: ClinicianVisual[];
}

interface ClinicianGuideData {
  reportTitle: string;
  overview: string;
  pages: ClinicianPage[];
}

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BLUE, font: "Arial", size: 24 })],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE },
    },
    spacing: { before: 280, after: 120 },
  });
}

function pageHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: TEAL, font: "Arial", size: 22 })],
    spacing: { before: 200, after: 60 },
    shading: { fill: LIGHT_GRAY },
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: "Arial", size: 20 })],
    spacing: { after: 80 },
  });
}

function bulletParagraph(label: string, detail: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: "Arial", size: 20 }),
      new TextRun({ text: detail, font: "Arial", size: 20 }),
    ],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { after: 60 },
    bullet: { level: 0 },
  });
}

function buildDocument(d: ClinicianGuideData): Document {
  const margin = 900;
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: d.reportTitle, bold: true, color: PURPLE, font: "Arial", size: 56 })],
      spacing: { after: 160 },
      alignment: AlignmentType.LEFT,
    })
  );

  // Divider
  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: BLUE } },
      spacing: { after: 200 },
    })
  );

  // Overview section
  children.push(sectionHeader("What This Dashboard Does"));
  children.push(bodyParagraph(d.overview));

  // Pages
  children.push(sectionHeader("Dashboard Pages"));

  for (const page of d.pages) {
    children.push(pageHeading(page.name));
    children.push(bodyParagraph(page.purpose));

    if (page.visuals.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "What you'll see on this page:", italics: true, font: "Arial", size: 20 })],
          spacing: { before: 80, after: 60 },
        })
      );
      for (const v of page.visuals) {
        children.push(bulletParagraph(v.label, v.explains));
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children,
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pbix")) {
      return NextResponse.json({ error: "Please upload a .pbix file." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let dashboard: PbixDashboard;
    try {
      dashboard = await parsePbixFile(buffer, file.name);
    } catch (parseErr) {
      console.error("Parse .pbix file error:", parseErr);
      return NextResponse.json(
        { error: "Could not read the .pbix file. Please check the file and try again." },
        { status: 422 }
      );
    }

    if (dashboard.pages.length === 0) {
      return NextResponse.json({ error: "No report pages found in this file." }, { status: 422 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: buildPrompt(dashboard) }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    if (!rawText.trim()) {
      throw new Error("AI returned an empty response. Please try again.");
    }

    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let data: ClinicianGuideData;
    try {
      data = JSON.parse(jsonText);
    } catch {
      throw new Error("AI response could not be parsed. The report may be too large — try a smaller .pbix file.");
    }

    const doc = buildDocument(data);
    const docBuffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(docBuffer);

    const safeName = (data.reportTitle || dashboard.reportName || "Dashboard")
      .replace(/[^a-zA-Z0-9_\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Clinician_Guide_${safeName}.docx"`,
      },
    });
  } catch (err) {
    console.error("Clinician Guide error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
