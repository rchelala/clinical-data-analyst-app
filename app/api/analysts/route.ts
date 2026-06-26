import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapAnalystRow } from '@/lib/brain-mappers';

export async function GET() {
  try {
    const rows = await sql`SELECT id, name FROM analysts ORDER BY name`;
    return NextResponse.json(rows.map(mapAnalystRow));
  } catch (err: unknown) {
    console.error('List analysts error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
