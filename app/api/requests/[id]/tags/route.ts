import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTagRow } from '@/lib/brain-mappers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    const body = await req.json() as { tagName?: string };
    const { tagName } = body;

    if (!tagName?.trim()) {
      return NextResponse.json(
        { error: 'tagName is required.' },
        { status: 400 }
      );
    }

    const normalizedName = tagName.trim().toLowerCase();

    // Two round trips: upsert the tag and link it to the request (guarded by
    // an EXISTS check on the request instead of relying on the request_tags
    // FK to fail) in one CTE, then a separate SELECT for the tag list. The
    // CTE's own LATERAL join over request_tags would read the pre-statement
    // snapshot and miss the tag just linked, so the list has to be a
    // follow-up statement (same as the DELETE handler below).
    const writeRows = await sql`
      WITH request_check AS (
        SELECT id FROM requests WHERE id = ${requestId}
      ),
      tag AS (
        INSERT INTO tags (name)
        VALUES (${normalizedName})
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      ),
      link AS (
        INSERT INTO request_tags (request_id, tag_id)
        SELECT ${requestId}, tag.id FROM tag
        WHERE EXISTS (SELECT 1 FROM request_check)
        ON CONFLICT DO NOTHING
        RETURNING request_id
      )
      SELECT (SELECT EXISTS(SELECT 1 FROM request_check)) AS request_exists
    `;

    const requestExists = writeRows.length > 0 && Boolean((writeRows[0] as any).request_exists);
    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    const tagRows = await sql`
      SELECT t.id, t.name
      FROM tags t
      JOIN request_tags rt ON rt.tag_id = t.id
      WHERE rt.request_id = ${requestId}
      ORDER BY t.name
    `;

    return NextResponse.json(tagRows.map(mapTagRow));
  } catch (err: unknown) {
    console.error('Add tag to request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    const tagIdParam = req.nextUrl.searchParams.get('tagId');
    const tagId = Number(tagIdParam);
    if (!tagIdParam || !Number.isFinite(tagId)) {
      return NextResponse.json({ error: 'tagId query param is required and must be numeric.' }, { status: 400 });
    }

    await sql`
      DELETE FROM request_tags
      WHERE request_id = ${requestId} AND tag_id = ${tagId}
    `;

    const rows = await sql`
      SELECT t.id, t.name
      FROM tags t
      JOIN request_tags rt ON rt.tag_id = t.id
      WHERE rt.request_id = ${requestId}
      ORDER BY t.name
    `;

    return NextResponse.json(rows.map(mapTagRow));
  } catch (err: unknown) {
    console.error('Remove tag from request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
