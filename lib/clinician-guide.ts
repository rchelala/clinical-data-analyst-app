import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  AlignmentType,
  convertInchesToTwip,
  PageOrientation,
  PageBreak,
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

// Raw Power BI visual types that carry no clinical meaning in a guide.
// Filtered out before describing a page so the output isn't cluttered with
// runs of "Shape / Divider" bullets and so heavy pages stay under the token cap.
const NON_INFORMATIVE_TYPES = new Set<string>([
  "shape",
  "textbox",
  "image",
  "actionButton",
  "bookmarkNavigator",
  "pageNavigator",
]);

// Upper bound on visuals described per page. Combined with the raised
// max_tokens, this keeps Claude's JSON response from being truncated on
// dense pages (some have 50+ visuals).
const MAX_VISUALS_PER_PAGE = 40;

function meaningfulVisuals(page: PbixPage): PbixPage["visuals"] {
  return page.visuals.filter((v) => !NON_INFORMATIVE_TYPES.has(v.type));
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

export function buildOnePagerPrompt(
  reportTitle: string,
  overview: string,
  pages: ClinicianPage[]
): string {
  // Feed the model everything already synthesized about the dashboard: the
  // overview plus every page name and its plain-language purpose. This gives it
  // enough context to write a genuinely high-level summary of how the whole
  // thing works, rather than restating any single page.
  const pageSummaries = pages.map((p) => ({ page: p.name, purpose: p.purpose }));

  return `You are writing the very first page of a plain-language guide for clinical staff (nurses, physicians, care coordinators) who will use a Power BI dashboard. They are NOT technical — avoid any mention of databases, SQL, data models, or Power BI internals.

This page is a "5-minute briefing": a high-level summary of how the WHOLE dashboard works, so someone who has never opened it understands what it's for and how to use it. Do not describe individual pages one by one — synthesize across all of them.

Return ONLY valid JSON — no markdown, no explanation. Use this exact shape:
{
  "gist": "2–3 sentences: what this dashboard is and what it helps the team do. Plain language.",
  "howItWorks": [
    "A short step describing what a clinician does first (e.g. pick a unit and date)",
    "The next step, and so on — 4 to 6 ordered steps that trace the typical path from opening it to acting on what they find"
  ],
  "whoUsesIt": "1 sentence naming the people who use it (roles), in plain language.",
  "goodToKnow": [
    "A short practical note (e.g. how often it refreshes)",
    "Another note (e.g. what the colors mean). 2 to 4 notes total."
  ]
}

Rules:
- Never use technical terms like "slicer", "DAX", "SQL", "dataset", "query", "visual", "Power BI model"
- Keep each step and note to one short sentence — clinicians are busy
- Ground it in the actual dashboard content below; do not invent topics that aren't there

Dashboard title: ${reportTitle}
Overview: ${overview}
Pages and their purposes: ${JSON.stringify(pageSummaries, null, 2)}`;
}

export function buildPagePrompt(page: PbixPage): string {
  const meaningful = meaningfulVisuals(page);
  const shown = meaningful.slice(0, MAX_VISUALS_PER_PAGE);
  const omittedCount = meaningful.length - shown.length;

  const visualsJson = shown.map((v) => ({
    type: friendlyVisualType(v.type),
    title: v.title ?? null,
  }));

  const omittedNote =
    omittedCount > 0
      ? `\n\nNote: this page has ${omittedCount} additional minor visual(s) not listed above. Describe only the visuals provided; do not invent others.`
      : "";

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
${JSON.stringify({ pageName: page.name, visuals: visualsJson }, null, 2)}${omittedNote}`;
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

// High-level "5-Minute Briefing" summary of the whole dashboard, rendered as
// page 1 of the guide above the detailed page-by-page content.
export interface ClinicianOnePager {
  gist: string;          // "In a nutshell" — what the dashboard is and does
  howItWorks: string[];  // ordered steps a clinician takes to use it
  whoUsesIt: string;     // the audience, in plain language
  goodToKnow: string[];  // short practical notes (refresh cadence, color meaning…)
}

export interface ClinicianGuideData {
  reportTitle: string;
  overview: string;
  pages: ClinicianPage[];
  onePager?: ClinicianOnePager | null;
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

// Builds a page description without calling the AI, used when the model's
// response for a page can't be parsed. Ensures one bad page never fails the
// whole guide — the .docx still generates with a reasonable stand-in.
export function buildFallbackPage(page: PbixPage): ClinicianPage {
  const visuals: ClinicianVisual[] = meaningfulVisuals(page)
    .slice(0, MAX_VISUALS_PER_PAGE)
    .map((v) => ({
      label: v.title ?? friendlyVisualType(v.type),
      explains: `A ${friendlyVisualType(v.type).toLowerCase()} on this page.`,
    }));

  return {
    name: page.name,
    purpose: `This page ("${page.name}") is part of the dashboard. Review its visuals below for the details it provides.`,
    visuals,
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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

export function normalizeOnePager(raw: unknown): ClinicianOnePager {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    gist: typeof d.gist === "string" ? d.gist : "",
    howItWorks: stringList(d.howItWorks),
    whoUsesIt: typeof d.whoUsesIt === "string" ? d.whoUsesIt : "",
    goodToKnow: stringList(d.goodToKnow),
  };
}

// Builds the one-pager without calling the AI, used when the model's response
// can't be parsed. Keeps the guide complete rather than failing the job.
export function buildFallbackOnePager(
  reportTitle: string,
  overview: string,
  pages: ClinicianPage[]
): ClinicianOnePager {
  return {
    gist:
      overview ||
      `${reportTitle} brings together the information the team needs in one place.`,
    howItWorks: [
      "Use the filters at the top to choose the unit and dates you care about.",
      "Start on the main page for the overall picture.",
      "Open a specific page to see the details behind it.",
      "Use what you find to guide the team's next steps.",
    ],
    whoUsesIt: "Clinical and quality staff who monitor this area of care.",
    goodToKnow: [
      `This dashboard has ${pages.length} pages, each covering a different topic.`,
      "The filters at the top apply to the pages you open.",
    ],
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

function subHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: TEAL, font: "Arial", size: 20 })],
    spacing: { before: 160, after: 60 },
  });
}

function numberedStep(n: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${n}.  `, bold: true, color: TEAL, font: "Arial", size: 20 }),
      new TextRun({ text, font: "Arial", size: 20 }),
    ],
    indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
    spacing: { after: 70 },
  });
}

function bulletLine(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: "Arial", size: 20 })],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { after: 50 },
    bullet: { level: 0 },
  });
}

// Page 1 — the "5-Minute Briefing". Returns the paragraphs plus a trailing
// page break so the detailed guide starts on its own page.
function buildOnePagerSection(onePager: ClinicianOnePager, reportTitle: string): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      children: [new TextRun({ text: reportTitle, bold: true, color: PURPLE, font: "Arial", size: 52 })],
      spacing: { after: 40 },
    })
  );
  out.push(
    new Paragraph({
      children: [new TextRun({ text: "Your 5-minute briefing", color: TEAL, font: "Arial", size: 24, bold: true })],
      spacing: { after: 120 },
    })
  );
  out.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: BLUE } },
      spacing: { after: 160 },
    })
  );

  if (onePager.gist) {
    out.push(sectionHeader("In a Nutshell"));
    out.push(bodyParagraph(onePager.gist));
  }

  if (onePager.howItWorks.length > 0) {
    out.push(sectionHeader("How It Works"));
    onePager.howItWorks.forEach((step, i) => out.push(numberedStep(i + 1, step)));
  }

  if (onePager.whoUsesIt) {
    out.push(subHeading("Who Uses It"));
    out.push(bodyParagraph(onePager.whoUsesIt));
  }

  if (onePager.goodToKnow.length > 0) {
    out.push(subHeading("Good to Know"));
    onePager.goodToKnow.forEach((note) => out.push(bulletLine(note)));
  }

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

export function buildDocument(d: ClinicianGuideData): Document {
  const margin = 900;
  const children: Paragraph[] = [];

  if (d.onePager) {
    children.push(...buildOnePagerSection(d.onePager, d.reportTitle));
  }

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
