// Static reference content for the "How ClinKit uses AI" modal (components/AiInfoButton.tsx).
// Single source of truth: each AI-using feature — what it does, which model it uses, what
// data leaves the browser, and where it goes — plus a privacy/PHI block. Values here are
// kept in sync with the API routes they describe; update this file if a route's model or
// payload changes.
//
// Verified against:
//   Field Request  -> app/api/generate-sql/route.ts
//   IT Reference   -> app/api/it-reference/route.ts
//   Clinician Guide-> app/api/clinician-guide/route.ts + step/route.ts
//   CMIO Review    -> app/api/cmio-review/route.ts + step/route.ts, lib/cmio-review-prompt.ts
//   Commenter      -> app/api/comment/route.ts
//   Weekly Update  -> app/api/weekly-update/route.ts
//   PBIX Explorer  -> lib/pbix-parser-browser.ts (no AI)

import {
  TableProperties,
  FileText,
  Users,
  ClipboardList,
  Code2,
  CalendarDays,
  Search,
  type LucideIcon,
} from "lucide-react";

export interface AiFeatureInfo {
  /** Feature name as shown to the user. */
  name: string;
  /** Lucide icon matching the feature's tab/nav icon where one exists. */
  Icon: LucideIcon;
  /** Whether this feature actually calls an AI model. */
  usesAI: boolean;
  /** One plain sentence: what the feature does. */
  whatItDoes: string;
  /** Model(s) used, human-readable (e.g. "Claude Haiku 4.5"). Empty when usesAI is false. */
  model: string;
  /** What data leaves your browser for the AI. For non-AI features, what happens instead. */
  dataSent: string;
  /** Where that data goes (provider/service). Empty when usesAI is false. */
  goesTo: string;
}

export const AI_FEATURES: AiFeatureInfo[] = [
  {
    name: "Field Request → SQL",
    Icon: TableProperties,
    usesAI: true,
    whatItDoes:
      "Turns a list of requested fields into T-SQL SELECT queries, inferring each field's logic from its name, type, tooltip, and notes.",
    model: "Claude Haiku 4.5 (or Gemini 2.5 Flash Lite)",
    dataSent: "The table name and the field names, tooltips, and notes you type.",
    goesTo: "Anthropic (or Google, if Gemini is selected)",
  },
  {
    name: "IT Reference",
    Icon: FileText,
    usesAI: true,
    whatItDoes:
      "Reads a SQL view or stored procedure and produces a formatted Word document describing it (data sources, tables, patient population, refresh cadence).",
    model: "Claude Haiku 4.5",
    dataSent:
      "The SQL you paste. (The full source-table list is also parsed locally in code, so it stays complete.)",
    goesTo: "Anthropic",
  },
  {
    name: "Clinician Guide",
    Icon: Users,
    usesAI: true,
    whatItDoes:
      "Turns an uploaded .pbix dashboard into a plain-language guide, describing each page and its visuals.",
    model: "Claude Sonnet 4.6 (overview & summary) + Haiku 4.5 (per page)",
    dataSent:
      "Only the dashboard's structure — page names and visual types/titles. The underlying data and numbers are never sent.",
    goesTo: "Anthropic",
  },
  {
    name: "CMIO Review",
    Icon: ClipboardList,
    usesAI: true,
    whatItDoes:
      "Reads a meeting transcript and extracts action items into rows for the CMIO weekly tracker.",
    model: "Claude Sonnet 4.6 (per transcript chunk)",
    dataSent: "The meeting transcript you paste.",
    goesTo: "Anthropic",
  },
  {
    name: "Commenter",
    Icon: Code2,
    usesAI: true,
    whatItDoes:
      "Adds explanatory comments to SQL or DAX you paste, or writes a plain-English summary of it.",
    model: "Claude Sonnet 4.6 (comment) / Haiku 4.5 (summarize) — or Gemini 2.5 Flash Lite",
    dataSent: "The SQL or DAX code you paste.",
    goesTo: "Anthropic (or Google, if Gemini is selected)",
  },
  {
    name: "Weekly Update (Worklist)",
    Icon: CalendarDays,
    usesAI: true,
    whatItDoes:
      "Turns your worklist data into a written weekly status update.",
    model: "Claude Haiku 4.5 (or Gemini 2.5 Flash Lite)",
    dataSent: "Your worklist text and the analyst name.",
    goesTo: "Anthropic (or Google, if Gemini is selected)",
  },
  {
    name: "PBIX Explorer",
    Icon: Search,
    usesAI: false,
    whatItDoes:
      "Lists a .pbix dashboard's pages, visuals, and measures. This runs entirely in your browser — no AI is involved.",
    model: "",
    dataSent: "The .pbix is unzipped and read in your browser. Nothing is sent to any AI.",
    goesTo: "",
  },
];

export interface PrivacyPoint {
  /** Short bold lead-in. */
  title: string;
  /** The explanatory sentence(s). */
  body: string;
  /** Set for the one point that is a caution rather than a reassurance. */
  caution?: boolean;
}

export const AI_PRIVACY_POINTS: PrivacyPoint[] = [
  {
    title: "AI only sees what you provide",
    body:
      "The AI is only ever sent what you paste or upload. ClinKit never pulls records from a database or the EHR and sends them to AI on its own.",
  },
  {
    title: "PBIX Explorer uses no AI",
    body:
      "The .pbix explorer parses your file entirely in the browser. Nothing about it is sent to any AI service.",
  },
  {
    title: "Dashboard uploads send structure only",
    body:
      "When you build a Clinician Guide from a .pbix, only the page and visual names are sent — never the data, numbers, or patient counts inside the dashboard.",
  },
  {
    title: "You choose the provider",
    body:
      "Requests go to Claude (Anthropic) by default. Some tools can optionally use Gemini (Google) via the selector in the header.",
  },
  {
    title: "CMIO transcript caveat",
    body:
      "The full transcript you paste is transmitted to the AI. The model is instructed to strip patient-identifying details from the rows it writes, but that governs the output — not the input. Avoid pasting PHI you don't want sent.",
    caution: true,
  },
];
