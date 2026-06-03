import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "@/lib/providers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FieldRow {
  fieldName: string;
  format: string;
  tooltip: string;
  comments: string;
}

function buildSqlPrompt(tableName: string, fields: FieldRow[]): string {
  const fieldList = fields
    .filter((f) => f.fieldName.trim())
    .map((f, i) =>
      `${i + 1}. Field: ${f.fieldName}, Type: ${f.format}, Tooltip: "${f.tooltip || "N/A"}", Notes: "${f.comments || "N/A"}"`
    )
    .join("\n");

  return `You are a senior SQL Server (T-SQL / SSMS) developer and data analyst.

A team has submitted a field request. For each field, you must infer the calculation logic from the field name, data type, tooltip, and comments — then write a SELECT query that produces that field's value.

Table: ${tableName}
Fields requested:
${fieldList}

Instructions:
- For each field, write a separate SELECT statement that calculates or derives the field value using best-guess logic based on the field name and tooltip
- Read the tooltip and comments carefully — they describe the business meaning (e.g. "Count of patients with Lupus Nephritis" → COUNT(DISTINCT) with a WHERE filter on that condition)
- Use WHERE 1=1 as the base filter so additional conditions can easily be appended
- Use the table name provided in the FROM clause
- Alias the result column using the exact field name requested
- Use T-SQL syntax (SQL Server / SSMS)
- Add --** comments above each query explaining what it is calculating and why the logic was chosen
- Add a --** NOTE: comment if you made assumptions about column names or logic that the analyst should verify
- Do NOT wrap output in markdown fences
- Return only the SQL, nothing else

Example for reference:
Field: LN_Pt_Cnt, Type: INT, Tooltip: "Count of patients with Lupus Nephritis"
Expected output style:
--** Count of distinct patients diagnosed with Lupus Nephritis
--** NOTE: Assumes a condition/diagnosis column exists — analyst should verify column name
SELECT
    COUNT(DISTINCT PatientID) AS LN_Pt_Cnt
FROM ${tableName}
WHERE 1=1
    AND LupusNephritis IS NOT NULL

Now generate SQL for each of the following fields:
${fieldList}`;
}

export async function POST(req: NextRequest) {
  try {
    const { tableName, fields, provider = "claude" } = await req.json() as {
      tableName: string;
      fields: FieldRow[];
      provider?: AIProvider;
    };

    if (!tableName?.trim() || !fields?.length) {
      return NextResponse.json(
        { error: "Table name and at least one field are required." },
        { status: 400 }
      );
    }

    if (fields.length > 100) {
      return NextResponse.json({ error: "Too many fields. Please limit to 100 per request." }, { status: 400 });
    }

    const totalTextLength = fields.reduce((sum, f) =>
      sum + (f.fieldName?.length ?? 0) + (f.tooltip?.length ?? 0) + (f.comments?.length ?? 0), 0
    );
    if (totalTextLength > 50_000) {
      return NextResponse.json({ error: "Field data too large. Please reduce the amount of text." }, { status: 400 });
    }

    const filtered = fields.filter((f) => f.fieldName.trim());
    if (!filtered.length) {
      return NextResponse.json(
        { error: "Please fill in at least one field name." },
        { status: 400 }
      );
    }

    const prompt = buildSqlPrompt(tableName, filtered);

    // ── Gemini ────────────────────────────────────────────────────────────────
    if (provider === "gemini") {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "Gemini API key not configured. Add GEMINI_API_KEY to your environment variables." },
          { status: 500 }
        );
      }
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await genAI.models.generateContent({ model: "gemini-2.5-flash-lite", contents: prompt });
      return NextResponse.json({ sql: result.text ?? "" });
    }

    // ── Claude (default) ──────────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "API key not configured." }, { status: 500 });
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const result = message.content[0];
    if (result.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI." }, { status: 500 });
    }

    return NextResponse.json({ sql: result.text });
  } catch (err: unknown) {
    console.error("Generate SQL error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
