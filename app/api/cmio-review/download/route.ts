import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";
import { toDateOnlyString } from "@/lib/dates";

// Job ids are Postgres `uuid` columns (scripts/schema.sql) — validate before
// querying so a malformed id returns a clean 404 instead of a Postgres
// "invalid input syntax for type uuid" error surfacing as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const rows = await sql`
      SELECT status, blob_pathname, mode, meeting_date
      FROM cmio_review_jobs
      WHERE id = ${jobId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = rows[0] as {
      status: string;
      blob_pathname: string | null;
      mode: "append" | "standalone";
      meeting_date: string | Date | null;
    };
    if (job.status !== "done" || !job.blob_pathname) {
      return NextResponse.json({ error: "This review isn't ready yet." }, { status: 409 });
    }

    const result = await get(job.blob_pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Tracker file not found." }, { status: 404 });
    }

    const fileName =
      job.mode === "standalone"
        ? `CMIO_Review_${toDateOnlyString(job.meeting_date)}.xlsx`
        : "CMIO_Weekly_Review.xlsx";

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("CMIO Review download error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
