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

// A claimed finalize that never completes (crash, timeout mid-run) would
// otherwise leave the job stuck at 'finalizing' forever — this is how long
// we wait before letting another request reclaim and retry it.
const STUCK_FINALIZE_MINUTES = 2;

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

function buildProcessingResponse(job: JobRow) {
  return NextResponse.json({ status: "processing", chunksDone: job.chunks_done, chunksTotal: job.chunks_total });
}

function buildStatusResponse(job: JobRow) {
  if (job.status === "done") return buildDoneResponse(job);
  // A 'finalizing' job is still being worked (by whoever won the claim) —
  // report it to the client as processing so it keeps polling rather than
  // falling through to either phase itself.
  if (job.status === "finalizing") return buildProcessingResponse(job);
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

    // ---- Decide whether this request should run the finalize phase ----
    // Finalize is claimed atomically so that only one concurrent request
    // (racing poll, retry, or a reclaim of a dead finalize) ever proceeds
    // past this point for a given job.
    let shouldFinalize = false;

    if (job.status === "processing" && job.chunks_done >= job.chunks_total) {
      const claimed = await sql`
        UPDATE cmio_review_jobs
        SET status = 'finalizing', updated_at = now()
        WHERE id = ${jobId} AND status = 'processing' AND chunks_done >= chunks_total
        RETURNING id
      `;
      if (claimed.length > 0) {
        shouldFinalize = true;
      } else {
        // Someone else claimed it first (or it already finished) between our
        // read and our claim attempt — report current state instead.
        const fresh = (await sql`SELECT * FROM cmio_review_jobs WHERE id = ${jobId}`)[0] as unknown as JobRow;
        return buildStatusResponse(fresh);
      }
    } else if (job.status === "finalizing") {
      // A claim that died mid-finalize would otherwise leave the job stuck
      // here forever — allow reclaiming it once it's been stale long enough.
      const reclaimed = await sql`
        UPDATE cmio_review_jobs
        SET status = 'finalizing', updated_at = now()
        WHERE id = ${jobId} AND status = 'finalizing'
          AND updated_at < now() - make_interval(mins => ${STUCK_FINALIZE_MINUTES})
        RETURNING id
      `;
      if (reclaimed.length > 0) {
        shouldFinalize = true;
      } else {
        return buildStatusResponse(job);
      }
    } else if (job.status !== "processing") {
      return buildStatusResponse(job);
    }

    const meetingDate = toDateOnlyString(job.meeting_date);

    // ---- Finalize phase: every chunk has been extracted ----
    if (shouldFinalize) {
      // Belt-and-suspenders for a reclaim after a mostly-complete run: if the
      // result was already produced, don't rebuild/re-append — just confirm done.
      if (job.blob_pathname && (job.mode === "standalone" || job.result_version != null)) {
        await sql`UPDATE cmio_review_jobs SET status = 'done', updated_at = now() WHERE id = ${jobId}`;
        return buildDoneResponse({ ...job, status: "done" });
      }

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
        let versionedTrackerPath: string | null = null;
        let heldFilename: string | null = null;
        let newVersion: number | null = null;

        if (job.mode === "standalone") {
          workbookBuffer = await buildStandaloneTracker(deduped);
        } else {
          // Re-read the held tracker's LATEST version now, inside the claimed
          // finalize — not from any earlier read — so we append onto whatever
          // is actually current at the moment we're about to write.
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

          newVersion = heldRow.version + 1;
          versionedTrackerPath = `cmio-trackers/v${newVersion}.xlsx`;
          heldFilename = heldRow.filename;
          await put(versionedTrackerPath, workbookBuffer, {
            access: "private",
            contentType: XLSX_CONTENT_TYPE,
          });
        }

        const jobPathname = `cmio-reviews/${jobId}.xlsx`;
        await put(jobPathname, workbookBuffer, { access: "private", contentType: XLSX_CONTENT_TYPE });

        if (job.mode === "standalone") {
          await sql`
            UPDATE cmio_review_jobs
            SET status = 'done',
                blob_pathname = ${jobPathname},
                result_version = ${null},
                rows = ${JSON.stringify(deduped)},
                notes = ${JSON.stringify(notes)},
                updated_at = now()
            WHERE id = ${jobId}
          `;
        } else {
          // The tracker INSERT and the job's done/result_version UPDATE must
          // agree or not happen at all — run them as one atomic transaction.
          // cmio_tracker.version is UNIQUE, so if a second finalize somehow
          // also reaches this point with the same newVersion, its INSERT
          // throws and the whole transaction (including its job UPDATE)
          // rolls back rather than silently double-appending rows.
          try {
            await sql.transaction([
              sql`
                INSERT INTO cmio_tracker (blob_pathname, filename, version)
                VALUES (${versionedTrackerPath}, ${heldFilename}, ${newVersion})
              `,
              sql`
                UPDATE cmio_review_jobs
                SET status = 'done',
                    blob_pathname = ${jobPathname},
                    result_version = ${newVersion},
                    rows = ${JSON.stringify(deduped)},
                    notes = ${JSON.stringify(notes)},
                    updated_at = now()
                WHERE id = ${jobId}
              `,
            ]);
          } catch (txnErr) {
            // If another finalize already won (its transaction committed
            // first), treat that as success rather than failing this request.
            const settled = (await sql`SELECT * FROM cmio_review_jobs WHERE id = ${jobId}`)[0] as unknown as JobRow;
            if (settled.status === "done") {
              return buildDoneResponse(settled);
            }
            throw txnErr;
          }
        }

        const finalJob = (await sql`SELECT * FROM cmio_review_jobs WHERE id = ${jobId}`)[0] as unknown as JobRow;
        return buildDoneResponse(finalJob);
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
    const chunksDone = chunkIndex + 1;

    // CAS on chunks_done so a duplicate/racing poll for the same chunk can't
    // clobber the other's rows with a stale read-modify-write.
    const advanced = await sql`
      UPDATE cmio_review_jobs
      SET rows = ${JSON.stringify(updatedRows)}, chunks_done = ${chunksDone}, updated_at = now()
      WHERE id = ${jobId} AND chunks_done = ${chunkIndex}
      RETURNING id
    `;

    if (advanced.length === 0) {
      const fresh = (await sql`
        SELECT chunks_done, chunks_total, status FROM cmio_review_jobs WHERE id = ${jobId}
      `)[0] as { chunks_done: number; chunks_total: number; status: string };
      return NextResponse.json({ status: "processing", chunksDone: fresh.chunks_done, chunksTotal: fresh.chunks_total });
    }

    return NextResponse.json({ status: "processing", chunksDone, chunksTotal: job.chunks_total });
  } catch (err) {
    console.error("CMIO Review step error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
