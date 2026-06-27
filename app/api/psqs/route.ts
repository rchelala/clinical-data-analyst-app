import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapPsqRow } from '@/lib/brain-mappers';

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
      SELECT id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, created_date, last_touched_date
      FROM psqs
      WHERE analyst_id = ${analystId}
      ORDER BY year DESC NULLS LAST, name
    `;

    return NextResponse.json(rows.map(mapPsqRow));
  } catch (err: unknown) {
    console.error('List psqs error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      analystId?: number;
      name?: string;
      divisionId?: number;
      year?: number;
      status?: string;
      tasks?: string;
      comments?: string;
      notes?: string;
      enterpriseAnalyst?: string;
    };

    const { analystId, name, divisionId, year, status, tasks, comments, notes, enterpriseAnalyst } = body;

    if (analystId === undefined || analystId === null) {
      return NextResponse.json(
        { error: 'analystId is required.' },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'name is required.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO psqs (analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst)
      VALUES (${analystId}, ${divisionId ?? null}, ${year ?? null}, ${name}, ${status ?? null}, ${tasks ?? null}, ${comments ?? null}, ${notes ?? null}, ${enterpriseAnalyst ?? null})
      RETURNING id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, created_date, last_touched_date
    `;

    return NextResponse.json(mapPsqRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create psq error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced analystId/divisionId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
