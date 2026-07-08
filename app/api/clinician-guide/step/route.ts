import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { PbixDashboard } from "@/lib/pbix-parser";
import {
  buildPagePrompt,
  normalizePage,
  packDocument,
  safeFileSlug,
  ClinicianPage,
} from "@/lib/clinician-guide";

interface JobRow {
  id: string;
  status: string;
  report_title: string;
  overview: string;
  dashboard: PbixDashboard;
  pages_total: number;
  pages_done: number;
  guide_pages: ClinicianPage[];
  error: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const rows = await sql`SELECT * FROM clinician_guide_jobs WHERE id = ${jobId}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = rows[0] as unknown as JobRow;

    if (job.status !== "processing") {
      return buildStatusResponse(job);
    }

    const page = job.dashboard.pages[job.pages_done];

    let guidePage: ClinicianPage;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPagePrompt(page) }],
      });

      const rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      guidePage = normalizePage(page.name, JSON.parse(jsonText));
    } catch (err) {
      console.error("Clinician Guide step error:", err);
      await sql`
        UPDATE clinician_guide_jobs
        SET status = 'failed', error = ${"Could not generate the guide for this report. Please try again."}, updated_at = now()
        WHERE id = ${jobId}
      `;
      return NextResponse.json(
        { status: "failed", error: "Could not generate the guide for this report. Please try again." },
        { status: 200 }
      );
    }

    const updatedPages = [...job.guide_pages, guidePage];
    const pagesDone = job.pages_done + 1;

    if (pagesDone < job.pages_total) {
      await sql`
        UPDATE clinician_guide_jobs
        SET guide_pages = ${JSON.stringify(updatedPages)}, pages_done = ${pagesDone}, updated_at = now()
        WHERE id = ${jobId}
      `;
      return NextResponse.json({ status: "processing", pagesDone, pagesTotal: job.pages_total });
    }

    try {
      const docBuffer = await packDocument({
        reportTitle: job.report_title,
        overview: job.overview,
        pages: updatedPages,
      });

      const safeName = safeFileSlug(job.report_title || job.dashboard.reportName || "Dashboard");
      const pathname = `clinician-guides/${jobId}.docx`;
      await put(pathname, docBuffer, { access: "private", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

      await sql`
        UPDATE clinician_guide_jobs
        SET guide_pages = ${JSON.stringify(updatedPages)}, pages_done = ${pagesDone}, status = 'done', blob_pathname = ${pathname}, updated_at = now()
        WHERE id = ${jobId}
      `;

      return NextResponse.json({
        status: "done",
        pagesDone,
        pagesTotal: job.pages_total,
        downloadUrl: `/api/clinician-guide/download?jobId=${jobId}`,
        fileName: `Clinician_Guide_${safeName}.docx`,
      });
    } catch (err) {
      console.error("Clinician Guide docx build error:", err);
      await sql`
        UPDATE clinician_guide_jobs
        SET status = 'failed', error = ${"Could not build the Word document. Please try again."}, updated_at = now()
        WHERE id = ${jobId}
      `;
      return NextResponse.json(
        { status: "failed", error: "Could not build the Word document. Please try again." },
        { status: 200 }
      );
    }
  } catch (err) {
    console.error("Clinician Guide step error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}

function buildStatusResponse(job: JobRow) {
  if (job.status === "done") {
    const safeName = safeFileSlug(job.report_title || job.dashboard.reportName || "Dashboard");
    return NextResponse.json({
      status: "done",
      pagesDone: job.pages_done,
      pagesTotal: job.pages_total,
      downloadUrl: `/api/clinician-guide/download?jobId=${job.id}`,
      fileName: `Clinician_Guide_${safeName}.docx`,
    });
  }
  return NextResponse.json({
    status: "failed",
    error: job.error ?? "Could not generate the guide for this report. Please try again.",
  });
}
