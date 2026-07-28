import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { sql } from "@/lib/db";
import { PbixDashboard, PbixPage, PbixVisual } from "@/lib/pbix-parser";
import { buildOverviewPrompt, normalizeOverview } from "@/lib/clinician-guide";

// The overview call is fast; the .pbix is now parsed in the browser and only the
// small extracted structure is posted here (a raw multi-MB .pbix would exceed the
// serverless request-body limit). This margin is just for cold starts.
export const maxDuration = 26;

const MAX_PAGES = 500;
const MAX_VISUALS_PER_PAGE = 2000;

// The dashboard is parsed client-side, so validate and bound it before use.
// We only need page names + visual types/titles here; measures are dropped.
function sanitizeDashboard(raw: unknown): PbixDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.pages)) return null;

  const reportName =
    typeof d.reportName === "string" && d.reportName.trim() ? d.reportName : "Dashboard";

  const pages: PbixPage[] = d.pages.slice(0, MAX_PAGES).map((p) => {
    const pg = (p ?? {}) as Record<string, unknown>;
    const name = typeof pg.name === "string" && pg.name.trim() ? pg.name : "Unnamed Page";
    const internalName = typeof pg.internalName === "string" ? pg.internalName : name;
    const visualsRaw = Array.isArray(pg.visuals) ? pg.visuals : [];
    const visuals: PbixVisual[] = visualsRaw.slice(0, MAX_VISUALS_PER_PAGE).map((v) => {
      const vv = (v ?? {}) as Record<string, unknown>;
      return {
        type: typeof vv.type === "string" ? vv.type : "unknown",
        title: typeof vv.title === "string" ? vv.title : undefined,
      };
    });
    return { name, internalName, visuals };
  });

  return { reportName, pages, measures: [], modelMeasuresAvailable: false };
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const dashboard = sanitizeDashboard((body as Record<string, unknown> | null)?.dashboard);
    if (!dashboard) {
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
