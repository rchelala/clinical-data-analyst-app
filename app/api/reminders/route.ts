import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Persistent per-analyst "Reminders" note on the Worklist page. Unlike
// weekly_notes it is not week-scoped, and it is kept out of the weekly update.
export async function GET(req: NextRequest) {
  try {
    const analystIdParam = req.nextUrl.searchParams.get('analystId');
    const analystId = analystIdParam ? Number(analystIdParam) : NaN;

    if (!analystIdParam || !Number.isFinite(analystId)) {
      return NextResponse.json(
        { error: 'analystId query param is required and must be numeric.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      SELECT reminders FROM analyst_reminders WHERE analyst_id = ${analystId}
    `;

    return NextResponse.json(rows.length > 0 ? { reminders: rows[0].reminders } : null);
  } catch (err: unknown) {
    console.error('Get reminders error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      analystId?: number;
      reminders?: string | null;
    };
    const { analystId, reminders } = body;

    if (analystId === undefined || analystId === null) {
      return NextResponse.json({ error: 'analystId is required.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO analyst_reminders (analyst_id, reminders)
      VALUES (${analystId}, ${reminders ?? null})
      ON CONFLICT (analyst_id) DO UPDATE SET reminders = EXCLUDED.reminders, updated_at = now()
      RETURNING reminders
    `;

    return NextResponse.json({ reminders: rows[0].reminders });
  } catch (err: unknown) {
    console.error('Upsert reminders error:', err);
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
