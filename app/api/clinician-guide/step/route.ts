import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import {
  anthropic,
  isAnthropicTimeout,
  isRetryableAnthropicError,
  isJobTooOld,
  AI_TIMEOUT_MESSAGE,
} from "@/lib/anthropic-client";
import { PbixDashboard } from "@/lib/pbix-parser";
import {
  buildPagePrompt,
  normalizePage,
  buildFallbackPage,
  buildOnePagerPrompt,
  normalizeOnePager,
  buildFallbackOnePager,
  packDocument,
  safeFileSlug,
  ClinicianPage,
  ClinicianOnePager,
} from "@/lib/clinician-guide";
import { parseJsonResponse } from "@/lib/parse-json-response";

// Give each step headroom over the platform's default sync-function limit.
// Individual steps are designed to finish in well under this (Haiku page calls
// ~7-13s incl. network); this is a safety margin against cold starts.
export const maxDuration = 26;

// Job ids are Postgres `uuid` columns (scripts/schema.sql) — validate before
// querying so a malformed id returns a clean 404 instead of a Postgres
// "invalid input syntax for type uuid" error surfacing as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface JobRow {
  id: string;
  status: string;
  report_title: string;
  overview: string;
  // The heavy `dashboard` JSONB (up to hundreds of pages) is never loaded in
  // full — only the report name (used as a filename fallback) is pulled out
  // via a jsonb path extraction, and the one page actually needed for the
  // current step is fetched separately below when the page phase is reached.
  dashboard_report_name: string | null;
  pages_total: number;
  pages_done: number;
  guide_pages: ClinicianPage[];
  one_pager: ClinicianOnePager | null;
  error: string | null;
  created_at: string | Date;
}

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const rows = await sql`
      SELECT
        id, status, report_title, overview, pages_total, pages_done,
        guide_pages, one_pager, error, created_at,
        dashboard->>'reportName' AS dashboard_report_name
      FROM clinician_guide_jobs WHERE id = ${jobId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = rows[0] as unknown as JobRow;

    if (job.status !== "processing") {
      return buildStatusResponse(job);
    }

    // ---- Finalize phase: every page has been described ----
    // Runs as its own short request(s) so each call makes at most one Claude
    // call and stays within the host's ~10s function timeout.
    if (job.pages_done >= job.pages_total) {
      // Step 1 — synthesize the one-pager (page 1 of the guide), once.
      if (!job.one_pager) {
        let onePager: ClinicianOnePager;
        try {
          const message = await anthropic.messages.create(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 1500,
              messages: [
                { role: "user", content: buildOnePagerPrompt(job.report_title, job.overview, job.guide_pages) },
              ],
            },
            { signal: req.signal }
          );
          const rawText = message.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");
          onePager = normalizeOnePager(parseJsonResponse(rawText));
        } catch (err) {
          // A hiccup here shouldn't waste a fully-described report — fall back
          // to a non-AI briefing and still finish the guide.
          console.error("Clinician Guide one-pager fallback:", err);
          onePager = buildFallbackOnePager(job.report_title, job.overview, job.guide_pages);
        }

        // CAS on one_pager being unset so an overlapping/duplicate poll can't
        // write it twice (each write is its own Claude call — see
        // cmio-review/step's chunks_done CAS for the same pattern).
        await sql`
          UPDATE clinician_guide_jobs
          SET one_pager = ${JSON.stringify(onePager)}, updated_at = now()
          WHERE id = ${jobId} AND one_pager IS NULL
        `;
        return NextResponse.json({ status: "processing", pagesDone: job.pages_done, pagesTotal: job.pages_total });
      }

      // Step 2 — build & upload the .docx (one-pager now included).
      try {
        const docBuffer = await packDocument({
          reportTitle: job.report_title,
          overview: job.overview,
          pages: job.guide_pages,
          onePager: job.one_pager,
        });

        const safeName = safeFileSlug(job.report_title || job.dashboard_report_name || "Dashboard");
        const pathname = `clinician-guides/${jobId}.docx`;
        // Same job, same content on a retry — allow overwriting rather than
        // throwing when a reclaimed finalize re-writes this job's own output
        // (mirrors cmio-review/step's jobPathname put()).
        await put(pathname, docBuffer, {
          access: "private",
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          allowOverwrite: true,
        });

        await sql`
          UPDATE clinician_guide_jobs
          SET status = 'done', blob_pathname = ${pathname}, updated_at = now()
          WHERE id = ${jobId}
        `;

        return NextResponse.json({
          status: "done",
          pagesDone: job.pages_done,
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
    }

    // ---- Page phase: describe the next report page ----
    // Fetch only the one page needed for this step (a jsonb path extraction)
    // instead of the entire `dashboard` blob, which can hold hundreds of
    // pages' worth of visuals/fields.
    const pageRows = await sql`
      SELECT jsonb_array_element(dashboard->'pages', ${job.pages_done}::int) AS page
      FROM clinician_guide_jobs WHERE id = ${jobId}
    `;
    const page = (pageRows[0] as { page: PbixDashboard['pages'][number] }).page;

    let guidePage: ClinicianPage;
    let rawText: string;
    try {
      const message = await anthropic.messages.create(
        {
          // Haiku for the hot per-page loop: describing a page's visuals is a
          // simple, well-structured task, and Haiku returns a dense page in ~7s
          // vs ~25s on Sonnet — the difference between finishing and hitting the
          // host's function timeout on visual-heavy pages. The flagship overview
          // and one-pager stay on Sonnet.
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          messages: [{ role: "user", content: buildPagePrompt(page) }],
        },
        { signal: req.signal }
      );

      rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } catch (err) {
      console.error("Clinician Guide step error:", err);

      if (isRetryableAnthropicError(err) && !isJobTooOld(job.created_at)) {
        // Transient upstream error (429/5xx/connection reset) — leave the
        // job exactly as it is (don't advance pages_done, don't fail it) so
        // the client's next poll retries this same page with a fresh
        // request budget instead of the whole run failing over a blip.
        // Bounded by isJobTooOld so a persistently failing page can't poll
        // forever.
        return NextResponse.json({ status: "processing", pagesDone: job.pages_done, pagesTotal: job.pages_total });
      }

      const errorMessage = isAnthropicTimeout(err)
        ? AI_TIMEOUT_MESSAGE
        : "Could not generate the guide for this report. Please try again.";
      await sql`
        UPDATE clinician_guide_jobs
        SET status = 'failed', error = ${errorMessage}, updated_at = now()
        WHERE id = ${jobId}
      `;
      return NextResponse.json({ status: "failed", error: errorMessage }, { status: 200 });
    }

    try {
      guidePage = normalizePage(page.name, parseJsonResponse(rawText));
    } catch (parseErr) {
      // Model returned non-JSON / truncated output for this page. Don't fail the
      // whole job — fall back to a non-AI description so the guide still completes.
      console.error("Clinician Guide page parse fallback:", parseErr);
      guidePage = buildFallbackPage(page);
    }

    const updatedPages = [...job.guide_pages, guidePage];
    const pagesDone = job.pages_done + 1;

    // Persist progress. When the last page lands, the job stays "processing" and
    // the next call enters the finalize phase above (one-pager, then docx).
    // CAS on pages_done so an overlapping/duplicate poll for the same page
    // can't clobber the other's pages with a stale read-modify-write (same
    // pattern as cmio-review/step's chunks_done CAS).
    const advanced = await sql`
      UPDATE clinician_guide_jobs
      SET guide_pages = ${JSON.stringify(updatedPages)}, pages_done = ${pagesDone}, updated_at = now()
      WHERE id = ${jobId} AND pages_done = ${job.pages_done}
      RETURNING id
    `;

    if (advanced.length === 0) {
      const freshRows = await sql`
        SELECT pages_done, pages_total, status FROM clinician_guide_jobs WHERE id = ${jobId}
      `;
      // The row can be gone by now (a racing/duplicate request could hit
      // this after the job row was removed) — report 404 instead of
      // throwing on `fresh[0]` being undefined.
      if (freshRows.length === 0) {
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }
      const fresh = freshRows[0] as { pages_done: number; pages_total: number; status: string };
      return NextResponse.json({ status: "processing", pagesDone: fresh.pages_done, pagesTotal: fresh.pages_total });
    }

    return NextResponse.json({ status: "processing", pagesDone, pagesTotal: job.pages_total });
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
    const safeName = safeFileSlug(job.report_title || job.dashboard_report_name || "Dashboard");
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
