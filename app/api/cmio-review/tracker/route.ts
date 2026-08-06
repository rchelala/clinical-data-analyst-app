import { NextRequest, NextResponse } from "next/server";
import { put, get } from "@vercel/blob";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { sql } from "@/lib/db";
import { appendRowsToTracker, readTrackerRows } from "@/lib/cmio-tracker";

export const maxDuration = 26;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEFAULT_FILENAME = "CMIO_Weekly_Review.xlsx";
const MAX_DECODED_BYTES = 10 * 1024 * 1024;

export async function GET() {
  try {
    const rows = await sql`
      SELECT version, filename, updated_at, blob_pathname FROM cmio_tracker ORDER BY version DESC LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ held: false });
    }

    const row = rows[0] as {
      version: number;
      filename: string;
      updated_at: string | Date;
      blob_pathname: string;
    };

    let trackerRows: Awaited<ReturnType<typeof readTrackerRows>> = [];
    let rowsError = false;
    try {
      const res = await get(row.blob_pathname, { access: "private" });
      if (!res || res.statusCode !== 200) {
        throw new Error("Tracker blob not found.");
      }
      const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
      trackerRows = await readTrackerRows(buf);
    } catch (err) {
      console.error("CMIO tracker preview error:", err);
      rowsError = true;
    }

    return NextResponse.json({
      held: true,
      version: row.version,
      filename: row.filename,
      updatedAt: row.updated_at,
      rows: trackerRows,
      rowCount: trackerRows.length,
      ...(rowsError ? { rowsError: true } : {}),
    });
  } catch (err) {
    console.error("CMIO tracker fetch error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
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
    const dataBase64 = typeof payload.dataBase64 === "string" ? payload.dataBase64 : "";
    const filename =
      typeof payload.filename === "string" && payload.filename.trim() ? payload.filename.trim() : DEFAULT_FILENAME;

    if (!dataBase64) {
      return NextResponse.json({ error: "Please provide the tracker file." }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(dataBase64, "base64");
    } catch {
      return NextResponse.json({ error: "Could not decode the uploaded file." }, { status: 422 });
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 422 });
    }
    if (buffer.length > MAX_DECODED_BYTES) {
      return NextResponse.json({ error: "The uploaded file is too large (max 10MB)." }, { status: 422 });
    }

    // .xlsx files are zip archives — a real one always starts with the "PK" signature.
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return NextResponse.json(
        { error: "This doesn't look like a valid .xlsx file." },
        { status: 422 }
      );
    }

    // Cheap "does this parse as a tracker" check: appending zero rows still
    // exercises the header-detection / column-mapping logic.
    try {
      await appendRowsToTracker(buffer, []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "This file doesn't look like a valid CMIO tracker.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const versionRows = await sql`SELECT COALESCE(MAX(version), 0) AS max_version FROM cmio_tracker`;
    const newVersion = Number((versionRows[0] as { max_version: number }).max_version) + 1;

    const pathname = `cmio-trackers/v${newVersion}.xlsx`;
    await put(pathname, buffer, { access: "private", contentType: XLSX_CONTENT_TYPE });

    const inserted = await sql`
      INSERT INTO cmio_tracker (blob_pathname, filename, version)
      VALUES (${pathname}, ${filename}, ${newVersion})
      RETURNING updated_at
    `;

    return NextResponse.json(
      {
        held: true,
        version: newVersion,
        filename,
        updatedAt: (inserted[0] as { updated_at: string | Date }).updated_at,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("CMIO tracker upload error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
