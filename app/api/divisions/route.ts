import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDivisionRow } from '@/lib/brain-mappers';

export async function GET() {
  try {
    const rows = await sql`SELECT id, name, sort_order, created_by_analyst_id FROM divisions ORDER BY sort_order`;
    return NextResponse.json(rows.map(mapDivisionRow));
  } catch (err: unknown) {
    console.error('List divisions error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string; analystId?: number };
    const { name, analystId } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO divisions (name, sort_order, created_by_analyst_id)
      VALUES (${name.trim()}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM divisions), ${analystId ?? null})
      RETURNING id, name, sort_order, created_by_analyst_id
    `;

    return NextResponse.json(mapDivisionRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create division error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'A division with this name already exists.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
