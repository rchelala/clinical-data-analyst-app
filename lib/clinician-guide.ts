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
import { PbixDashboard, PbixPage } from "@/lib/pbix-parser";

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

export function friendlyVisualType(type: string): string {
  return VISUAL_TYPE_LABELS[type] ?? type;
}

export function buildOverviewPrompt(dashboard: PbixDashboard): string {
  const pageNames = dashboard.pages.map((p) => p.name);

  return `You are writing a plain-language guide for clinical staff (nurses, physicians, care coordinators) who will use a Power BI dashboard. They are NOT technical — avoid any mention of databases, SQL, data models, or Power BI internals.

Given the dashboard's report name and page names below, return ONLY valid JSON — no markdown, no explanation.

Return this exact shape:
{
  "reportTitle": "A clean, human-readable title for this dashboard (infer from report name and page names)",
  "overview": "2–3 sentences explaining what this dashboard does and who would use it. Use plain language."
}

Report name: ${dashboard.reportName}
Page names: ${JSON.stringify(pageNames)}`;
}

export function buildPagePrompt(page: PbixPage): string {
  const visualsJson = page.visuals.map((v) => ({
    type: friendlyVisualType(v.type),
    title: v.title ?? null,
  }));

  return `You are writing a plain-language guide for clinical staff (nurses, physicians, care coordinators) who will use a Power BI dashboard. They are NOT technical — avoid any mention of databases, SQL, data models, or Power BI internals. Write as if explaining to a smart colleague who has never seen the dashboard before.

Given the single dashboard page described below, return ONLY valid JSON — no markdown, no explanation.

Return this exact shape:
{
  "purpose": "1–2 sentences: what question does this page answer? What would a clinician look at here?",
  "visuals": [
    {
      "label": "A human-friendly name for this visual (use the title if available, otherwise describe it by its type and apparent purpose)",
      "explains": "1 sentence: what does this chart or table show? What can the clinician learn from it?"
    }
  ]
}

Rules:
- Never use technical terms like "slicer", "DAX", "SQL", "dataset", "query", "visualType", "Power BI model"
- Replace "Slicer" / "Filter" visuals with plain language like "dropdown filter" or "date selector"
- Replace "tableEx" with "data table", "card" with "summary number", "KPI" with "goal tracker"
- If this page has no visuals worth describing, still return it with a helpful purpose description and an empty visuals array
- Keep all text concise — clinicians are busy

Page to analyze:
${JSON.stringify({ pageName: page.name, visuals: visualsJson }, null, 2)}`;
}

export interface ClinicianVisual {
  label: string;
  explains: string;
}

export interface ClinicianPage {
  name: string;
  purpose: string;
  visuals: ClinicianVisual[];
}

export interface ClinicianGuideData {
  reportTitle: string;
  overview: string;
  pages: ClinicianPage[];
}

export function normalizeVisual(v: unknown): ClinicianVisual {
  const raw = (v ?? {}) as Record<string, unknown>;
  return {
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label : "Untitled",
    explains: typeof raw.explains === "string" ? raw.explains : "",
  };
}

export function normalizePage(pageName: string, p: unknown): ClinicianPage {
  const raw = (p ?? {}) as Record<string, unknown>;
  return {
    name: pageName,
    purpose: typeof raw.purpose === "string" ? raw.purpose : "",
    visuals: Array.isArray(raw.visuals) ? raw.visuals.map(normalizeVisual) : [],
  };
}

export function normalizeOverview(
  raw: unknown,
  dashboard: PbixDashboard
): { reportTitle: string; overview: string } {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    reportTitle:
      typeof d.reportTitle === "string" && d.reportTitle.trim() ? d.reportTitle : dashboard.reportName,
    overview: typeof d.overview === "string" ? d.overview : "",
  };
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

export function buildDocument(d: ClinicianGuideData): Document {
  const margin = 900;
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: d.reportTitle, bold: true, color: PURPLE, font: "Arial", size: 56 })],
      spacing: { after: 160 },
      alignment: AlignmentType.LEFT,
    })
  );

  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: BLUE } },
      spacing: { after: 200 },
    })
  );

  children.push(sectionHeader("What This Dashboard Does"));
  children.push(bodyParagraph(d.overview));

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

export async function packDocument(d: ClinicianGuideData): Promise<Buffer> {
  const doc = buildDocument(d);
  return Packer.toBuffer(doc);
}

export function safeFileSlug(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}
