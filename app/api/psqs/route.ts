import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapPsqRow, mapPsqWithTaskCountRow } from '@/lib/brain-mappers';

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
      SELECT p.id, p.analyst_id, p.division_id, p.year, p.name, p.status, p.tasks, p.comments, p.notes, p.enterprise_analyst, p.summary, p.created_date, p.last_touched_date, p.dashboard_id,
             COALESCE(tc.active_task_count, 0) AS active_task_count,
             COALESCE(tc.total_task_count, 0) AS total_task_count
      FROM psqs p
      LEFT JOIN (
        SELECT psq_id,
          COUNT(*) FILTER (WHERE status <> 'done') AS active_task_count,
          COUNT(*) AS total_task_count
        FROM tasks
        WHERE owner_analyst_id = ${analystId} AND psq_id IS NOT NULL
        GROUP BY psq_id
      ) tc ON tc.psq_id = p.id
      WHERE p.analyst_id = ${analystId}
      ORDER BY p.year DESC NULLS LAST, p.name
    `;

    return NextResponse.json(rows.map(mapPsqWithTaskCountRow));
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
      summary?: string;
      dashboardId?: number;
    };

    const { analystId, name, divisionId, year, status, tasks, comments, notes, enterpriseAnalyst, summary, dashboardId } = body;

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
      INSERT INTO psqs (analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, summary, dashboard_id)
      VALUES (${analystId}, ${divisionId ?? null}, ${year ?? null}, ${name}, ${status ?? null}, ${tasks ?? null}, ${comments ?? null}, ${notes ?? null}, ${enterpriseAnalyst ?? null}, ${summary ?? null}, ${dashboardId ?? null})
      RETURNING id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, summary, created_date, last_touched_date, dashboard_id
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
