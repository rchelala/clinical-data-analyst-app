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

    const tagRows = await sql`
      INSERT INTO tags (name)
      VALUES (${normalizedName})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `;
    const tagId = tagRows[0].id;

    await sql`
      INSERT INTO request_tags (request_id, tag_id)
      VALUES (${requestId}, ${tagId})
      ON CONFLICT DO NOTHING
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
    console.error('Add tag to request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Request not found.' },
          { status: 400 }
        );
      }
    }
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
