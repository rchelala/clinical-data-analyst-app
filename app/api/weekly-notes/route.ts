import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapWeeklyNoteRow } from '@/lib/brain-mappers';

export async function GET(req: NextRequest) {
  try {
    const analystIdParam = req.nextUrl.searchParams.get('analystId');
    const weekStart = req.nextUrl.searchParams.get('weekStart');
    const analystId = analystIdParam ? Number(analystIdParam) : NaN;

    if (!analystIdParam || !Number.isFinite(analystId) || !weekStart) {
      return NextResponse.json(
        { error: 'analystId and weekStart query params are required, and analystId must be numeric.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      SELECT id, analyst_id, week_start, meetings
      FROM weekly_notes
      WHERE analyst_id = ${analystId} AND week_start = ${weekStart}
    `;

    return NextResponse.json(rows.length > 0 ? mapWeeklyNoteRow(rows[0]) : null);
  } catch (err: unknown) {
    console.error('Get weekly note error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      analystId?: number;
      weekStart?: string;
      meetings?: string | null;
    };
    const { analystId, weekStart, meetings } = body;

    if (analystId === undefined || analystId === null || !weekStart) {
      return NextResponse.json(
        { error: 'analystId and weekStart are required.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO weekly_notes (analyst_id, week_start, meetings)
      VALUES (${analystId}, ${weekStart}, ${meetings ?? null})
      ON CONFLICT (analyst_id, week_start) DO UPDATE SET meetings = EXCLUDED.meetings
      RETURNING id, analyst_id, week_start, meetings
    `;

    return NextResponse.json(mapWeeklyNoteRow(rows[0]));
  } catch (err: unknown) {
    console.error('Upsert weekly note error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced analystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
