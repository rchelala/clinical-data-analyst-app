import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { sql } from "@/lib/db";
import { parsePbixFile, PbixDashboard } from "@/lib/pbix-parser";
import { buildOverviewPrompt, normalizeOverview } from "@/lib/clinician-guide";

// Parsing a large .pbix plus the overview call can take ~7-8s; give it headroom
// over the platform's default sync-function limit.
export const maxDuration = 26;

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
      max_tokens: 500,
      messages: [{ role: "user", content: buildOverviewPrompt(dashboard) }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let overviewData: { reportTitle: string; overview: string };
    try {
      overviewData = normalizeOverview(JSON.parse(jsonText), dashboard);
    } catch {
      overviewData = normalizeOverview(null, dashboard);
    }

    await sql`DELETE FROM clinician_guide_jobs WHERE created_at < now() - interval '1 day'`;

    const rows = await sql`
      INSERT INTO clinician_guide_jobs (report_title, overview, dashboard, pages_total, pages_done, guide_pages)
      VALUES (${overviewData.reportTitle}, ${overviewData.overview}, ${JSON.stringify(dashboard)}, ${dashboard.pages.length}, 0, '[]')
      RETURNING id
    `;

    return NextResponse.json(
      {
        jobId: rows[0].id as string,
        pagesTotal: dashboard.pages.length,
        reportTitle: overviewData.reportTitle,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Clinician Guide start error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
