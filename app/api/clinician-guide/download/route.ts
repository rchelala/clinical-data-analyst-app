import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const rows = await sql`SELECT status, blob_pathname FROM clinician_guide_jobs WHERE id = ${jobId}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = rows[0] as { status: string; blob_pathname: string | null };
    if (job.status !== "done" || !job.blob_pathname) {
      return NextResponse.json({ error: "This guide isn't ready yet." }, { status: 409 });
    }

    const result = await get(job.blob_pathname, { access: "private" });
    if (result?.statusCode !== 200) {
      return NextResponse.json({ error: "Guide file not found." }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "attachment",
      },
    });
  } catch (err) {
    console.error("Clinician Guide download error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
