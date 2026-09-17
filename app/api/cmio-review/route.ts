import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { sql } from "@/lib/db";
import { chunkTranscript, MAX_CHUNKS } from "@/lib/cmio-chunk";
import { pad2, toLocalDateString } from "@/lib/dates";

// Chunking happens instantly (no Claude call in this route) — this margin is
// just for cold starts, mirroring the other CMIO Review / Clinician Guide routes.
export const maxDuration = 26;

const MAX_TRANSCRIPT_CHARS = 400_000;

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Looks for a "Month DD, YYYY" date (e.g. "July 22, 2026") in the first ~5
// lines of the transcript — most meeting transcript exports stamp the
// meeting date near the top.
function parseMeetingDateFromTranscript(transcript: string): string | null {
  const firstLines = transcript.split("\n").slice(0, 5).join("\n");
  const match = firstLines.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (!match) return null;

  const monthIdx = MONTH_NAMES.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (monthIdx === -1 || !day || !year) return null;

  const candidate = `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
  return isValidDateString(candidate) ? candidate : null;
}

// Priority: an explicit meetingDate wins, then a date parsed out of the
// transcript itself, then the caller's local "today" (clientDate — see
// lib/dates.ts toLocalDateString) when the client sent one, and only as a
// last resort the server's own local time (UTC on Netlify), which can be a
// day ahead of the analyst's actual evening in a US timezone.
function resolveMeetingDate(transcript: string, meetingDate: unknown, clientDate: unknown): string {
  if (typeof meetingDate === "string" && isValidDateString(meetingDate)) {
    return meetingDate;
  }
  const parsed = parseMeetingDateFromTranscript(transcript);
  if (parsed) return parsed;
  if (typeof clientDate === "string" && isValidDateString(clientDate)) {
    return clientDate;
  }
  return toLocalDateString();
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

    const payload = (body ?? {}) as Record<string, unknown>;
    const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
    const mode = payload.mode;

    if (!transcript) {
      return NextResponse.json({ error: "Please provide a meeting transcript." }, { status: 400 });
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        { error: "This transcript is too long to process. Please split it into smaller sections." },
        { status: 422 }
      );
    }
    if (mode !== "append" && mode !== "standalone") {
      return NextResponse.json(
        { error: 'mode must be "append" or "standalone".' },
        { status: 400 }
      );
    }

    if (mode === "append") {
      const heldRows = await sql`SELECT id FROM cmio_tracker ORDER BY version DESC LIMIT 1`;
      if (heldRows.length === 0) {
        return NextResponse.json(
          {
            error:
              'No tracker is held yet. Upload the current CMIO_Weekly_Review.xlsx first, or choose “Create standalone Excel”.',
          },
          { status: 409 }
        );
      }
    }

    const meetingDate = resolveMeetingDate(transcript, payload.meetingDate, payload.clientDate);
    const chunks = chunkTranscript(transcript);
    if (chunks.length > MAX_CHUNKS) {
      // Below MAX_TRANSCRIPT_CHARS but still chunks into more pieces than the
      // job pipeline is bounded for (e.g. many long lines) — reject up front
      // rather than letting lib/cmio-chunk.ts silently merge/truncate chunks.
      return NextResponse.json(
        { error: "This transcript is too long to process. Please split it." },
        { status: 400 }
      );
    }
    const chunksTotal = chunks.length;

    await sql`DELETE FROM cmio_review_jobs WHERE created_at < now() - interval '1 day'`;

    const rows = await sql`
      INSERT INTO cmio_review_jobs (mode, meeting_date, transcript, chunks_total, chunks_done, rows)
      VALUES (${mode}, ${meetingDate}, ${transcript}, ${chunksTotal}, 0, '[]')
      RETURNING id
    `;

    return NextResponse.json(
      { jobId: rows[0].id as string, chunksTotal, meetingDate },
      { status: 201 }
    );
  } catch (err) {
    console.error("CMIO Review start error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
