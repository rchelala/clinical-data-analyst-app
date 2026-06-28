import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTagRow } from '@/lib/brain-mappers';

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name
      FROM tags
      ORDER BY name
    `;

    return NextResponse.json(rows.map(mapTagRow));
  } catch (err: unknown) {
    console.error('List tags error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string };
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'name is required.' },
        { status: 400 }
      );
    }

    const normalizedName = name.trim().toLowerCase();

    const rows = await sql`
      INSERT INTO tags (name)
      VALUES (${normalizedName})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `;

    return NextResponse.json(mapTagRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create tag error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
