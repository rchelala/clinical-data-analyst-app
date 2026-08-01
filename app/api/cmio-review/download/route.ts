import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// See app/api/cmio-review/step/route.ts for why date-only columns are
// handled this way (avoids UTC/local skew on Postgres `date` values).
function toDateOnlyString(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
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
