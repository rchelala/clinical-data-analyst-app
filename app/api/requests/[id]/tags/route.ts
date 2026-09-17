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

    // Single round trip instead of three: upsert the tag, link it to the
    // request (guarded by an EXISTS check on the request instead of relying
    // on the request_tags FK to fail), then return the request's full tag
    // list, carrying whether the request existed so the caller can tell a
    // missing request apart from "no tags."
    const rows = await sql`
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
      SELECT
        (SELECT EXISTS(SELECT 1 FROM request_check)) AS request_exists,
        tags_agg.id, tags_agg.name
      FROM (SELECT 1) AS x
      LEFT JOIN LATERAL (
        SELECT t.id, t.name
        FROM tags t
        JOIN request_tags rt ON rt.tag_id = t.id
        WHERE rt.request_id = ${requestId}
        ORDER BY t.name
      ) tags_agg ON true
    `;

    const requestExists = rows.length > 0 && Boolean((rows[0] as any).request_exists);
    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    const tags = rows.filter((row: any) => row.id !== null);
    return NextResponse.json(tags.map(mapTagRow));
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
