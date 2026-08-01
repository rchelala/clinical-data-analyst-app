import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { put, get } from "@vercel/blob";
import { sql } from "@/lib/db";
import { chunkTranscript } from "@/lib/cmio-chunk";
import { buildExtractionPrompt, ExtractedRow } from "@/lib/cmio-review-prompt";
import { appendRowsToTracker, buildStandaloneTracker } from "@/lib/cmio-tracker";

// One Claude call per request, same reasoning as clinician-guide/step.
export const maxDuration = 26;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const VALID_PRIORITIES: ExtractedRow["priority"][] = ["High", "Medium", "Low"];
const VALID_STATUSES: ExtractedRow["status"][] = ["Open", "In progress", "Blocked", "Done"];

interface JobRow {
  id: string;
  status: string;
  mode: "append" | "standalone";
  meeting_date: string | Date;
  transcript: string;
  chunks_total: number;
  chunks_done: number;
  rows: ExtractedRow[];
  blob_pathname: string | null;
  result_version: number | null;
  notes: string[];
  error: string | null;
}

interface HeldTrackerRow {
  blob_pathname: string;
  filename: string;
  version: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Postgres `date` columns can come back as a plain "YYYY-MM-DD" string or as
// a Date object (local-midnight timestamp) depending on driver path — either
// way, taking the first 10 chars / local date parts avoids any UTC skew.
function toDateOnlyString(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function resolveFileName(mode: "append" | "standalone", meetingDate: string): string {
  return mode === "standalone" ? `CMIO_Review_${meetingDate}.xlsx` : "CMIO_Weekly_Review.xlsx";
}

function normalizeActionKey(action: string): string {
  return action.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

function dedupeRows(rows: ExtractedRow[]): { deduped: ExtractedRow[]; mergedCount: number } {
  const seen = new Set<string>();
  const deduped: ExtractedRow[] = [];
  let mergedCount = 0;
  for (const row of rows) {
    const key = normalizeActionKey(row.action);
    if (key && seen.has(key)) {
      mergedCount++;
      continue;
    }
    if (key) seen.add(key);
    deduped.push(row);
  }
  return { deduped, mergedCount };
}

function computeBreakdowns(rows: ExtractedRow[]) {
  const priorityBreakdown: Record<ExtractedRow["priority"], number> = { High: 0, Medium: 0, Low: 0 };
  const statusBreakdown: Record<ExtractedRow["status"], number> = {
    Open: 0,
    "In progress": 0,
    Blocked: 0,
    Done: 0,
  };
  for (const row of rows) {
    priorityBreakdown[row.priority] = (priorityBreakdown[row.priority] ?? 0) + 1;
    statusBreakdown[row.status] = (statusBreakdown[row.status] ?? 0) + 1;
  }
  return { priorityBreakdown, statusBreakdown };
}

// Defensively coerces one raw parsed object into an ExtractedRow shape. Drops
// rows with no action text; clamps priority/status to their allowed values;
// forces `date` to the meeting date regardless of what the model returned.
function coerceRow(raw: unknown, meetingDate: string): ExtractedRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const action = typeof r.action === "string" ? r.action.trim() : "";
  if (!action) return null;

  const priority = VALID_PRIORITIES.includes(r.priority as ExtractedRow["priority"])
    ? (r.priority as ExtractedRow["priority"])
    : "Medium";
  const status = VALID_STATUSES.includes(r.status as ExtractedRow["status"])
    ? (r.status as ExtractedRow["status"])
    : "Open";

  return {
    date: meetingDate,
    analyst: typeof r.analyst === "string" ? r.analyst : "",
    presenter: typeof r.presenter === "string" ? r.presenter : "",
    topic: typeof r.topic === "string" ? r.topic.trim() : "",
    action,
    priority,
    status,
    source: typeof r.source === "string" ? r.source : "",
  };
}

function buildDoneResponse(job: JobRow) {
  const meetingDate = toDateOnlyString(job.meeting_date);
  const { priorityBreakdown, statusBreakdown } = computeBreakdowns(job.rows ?? []);
  return NextResponse.json({
    status: "done",
    chunksDone: job.chunks_done,
    chunksTotal: job.chunks_total,
    rows: job.rows ?? [],
    notes: job.notes ?? [],
    priorityBreakdown,
    statusBreakdown,
    resultVersion: job.result_version,
    downloadUrl: `/api/cmio-review/download?jobId=${job.id}`,
    fileName: resolveFileName(job.mode, meetingDate),
  });
}

function buildStatusResponse(job: JobRow) {
  if (job.status === "done") return buildDoneResponse(job);
  return NextResponse.json({
    status: "failed",
    error: job.error ?? "Something went wrong processing this transcript. Please try again.",
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const jobId = (body as { jobId?: unknown } | null)?.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const rows = await sql`SELECT * FROM cmio_review_jobs WHERE id = ${jobId}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = rows[0] as unknown as JobRow;

    if (job.status !== "processing") {
      return buildStatusResponse(job);
    }

    const meetingDate = toDateOnlyString(job.meeting_date);

    // ---- Finalize phase: every chunk has been extracted ----
    if (job.chunks_done >= job.chunks_total) {
      const { deduped, mergedCount } = dedupeRows(job.rows ?? []);

      const notes: string[] = [];
      if (mergedCount > 0) {
        notes.push(
          `Merged ${mergedCount} duplicate action item${mergedCount === 1 ? "" : "s"} within the meeting.`
        );
      }
      notes.push("Priorities are ClinKit suggestions — the CMIO can override each one.");

      try {
        let workbookBuffer: Buffer;
        let resultVersion: number | null = null;

        if (job.mode === "standalone") {
          workbookBuffer = await buildStandaloneTracker(deduped);
        } else {
          const heldRows = await sql`
            SELECT blob_pathname, filename, version FROM cmio_tracker ORDER BY version DESC LIMIT 1
          `;
          if (heldRows.length === 0) {
            throw new Error("No held tracker was found to append to.");
          }
          const heldRow = heldRows[0] as unknown as HeldTrackerRow;

          const heldResult = await get(heldRow.blob_pathname, { access: "private" });
          if (!heldResult || heldResult.statusCode !== 200) {
            throw new Error("Could not read the held tracker file.");
          }
          const heldBuffer = Buffer.from(await new Response(heldResult.stream).arrayBuffer());

          workbookBuffer = await appendRowsToTracker(heldBuffer, deduped);

          const newVersion = heldRow.version + 1;
          const versionedPathname = `cmio-trackers/v${newVersion}.xlsx`;
          await put(versionedPathname, workbookBuffer, {
            access: "private",
            contentType: XLSX_CONTENT_TYPE,
          });
          await sql`
            INSERT INTO cmio_tracker (blob_pathname, filename, version)
            VALUES (${versionedPathname}, ${heldRow.filename}, ${newVersion})
          `;
          resultVersion = newVersion;
        }

        const jobPathname = `cmio-reviews/${jobId}.xlsx`;
        await put(jobPathname, workbookBuffer, { access: "private", contentType: XLSX_CONTENT_TYPE });

        await sql`
          UPDATE cmio_review_jobs
          SET status = 'done',
              blob_pathname = ${jobPathname},
              result_version = ${resultVersion},
              rows = ${JSON.stringify(deduped)},
              notes = ${JSON.stringify(notes)},
              updated_at = now()
          WHERE id = ${jobId}
        `;

        return buildDoneResponse({
          ...job,
          status: "done",
          rows: deduped,
          notes,
          result_version: resultVersion,
        });
      } catch (err) {
        console.error("CMIO Review finalize error:", err);
        const errorMessage = "Could not build the tracker file. Please try again.";
        await sql`
          UPDATE cmio_review_jobs
          SET status = 'failed', error = ${errorMessage}, updated_at = now()
          WHERE id = ${jobId}
        `;
        return NextResponse.json({ status: "failed", error: errorMessage }, { status: 200 });
      }
    }

    // ---- Chunk phase: extract action items from the next chunk ----
    const chunks = chunkTranscript(job.transcript);
    const chunkIndex = job.chunks_done;
    const transcriptChunk = chunks[chunkIndex] ?? "";

    let rawText: string;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: buildExtractionPrompt({
              transcriptChunk,
              meetingDate,
              chunkIndex,
              chunkCount: job.chunks_total,
            }),
          },
        ],
      });
      rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } catch (err) {
      console.error("CMIO Review step error:", err);
      const errorMessage = "Could not process this transcript. Please try again.";
      await sql`
        UPDATE cmio_review_jobs
        SET status = 'failed', error = ${errorMessage}, updated_at = now()
        WHERE id = ${jobId}
      `;
      return NextResponse.json({ status: "failed", error: errorMessage }, { status: 200 });
    }

    let extractedRows: ExtractedRow[] = [];
    try {
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        extractedRows = parsed
          .map((item) => coerceRow(item, meetingDate))
          .filter((row): row is ExtractedRow => row !== null);
      } else {
        console.error("CMIO Review chunk parse: response was not a JSON array", chunkIndex);
      }
    } catch (parseErr) {
      // One bad chunk shouldn't sink the whole run — treat it as yielding no rows.
      console.error("CMIO Review chunk parse fallback:", parseErr);
    }

    const updatedRows = [...(job.rows ?? []), ...extractedRows];
    const chunksDone = job.chunks_done + 1;

    await sql`
      UPDATE cmio_review_jobs
      SET rows = ${JSON.stringify(updatedRows)}, chunks_done = ${chunksDone}, updated_at = now()
      WHERE id = ${jobId}
    `;

    return NextResponse.json({ status: "processing", chunksDone, chunksTotal: job.chunks_total });
  } catch (err) {
    console.error("CMIO Review step error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
