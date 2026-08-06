import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT blob_pathname, filename FROM cmio_tracker ORDER BY version DESC LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "No tracker is held yet." }, { status: 404 });
    }

    const row = rows[0] as { blob_pathname: string; filename: string };

    const result = await get(row.blob_pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Tracker file not found." }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename="${row.filename}"`,
      },
    });
  } catch (err) {
    console.error("CMIO tracker download error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
