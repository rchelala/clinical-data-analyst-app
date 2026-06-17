import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDivisionRow } from '@/lib/brain-mappers';

export async function GET() {
  try {
    const rows = await sql`SELECT id, name, sort_order FROM divisions ORDER BY sort_order`;
    return NextResponse.json(rows.map(mapDivisionRow));
  } catch (err: unknown) {
    console.error('List divisions error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
