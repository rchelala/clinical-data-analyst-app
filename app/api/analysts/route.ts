import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapAnalystRow } from '@/lib/brain-mappers';

export async function GET() {
  try {
    const rows = await sql`SELECT id, name FROM analysts ORDER BY name`;
    return NextResponse.json(rows.map(mapAnalystRow));
  } catch (err: unknown) {
    console.error('List analysts error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
