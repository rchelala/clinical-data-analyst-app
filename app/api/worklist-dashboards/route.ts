import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDashboardRow, mapWorklistDashboardRow } from '@/lib/brain-mappers';

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
      SELECT d.*, owner.name AS analyst_name,
        COALESCE(tc.active_count, 0) AS active_task_count,
        COALESCE(tc.total_count, 0) AS total_task_count
      FROM worklist_dashboards w
      JOIN dashboards d ON d.id = w.dashboard_id
      LEFT JOIN analysts owner ON owner.id = d.analyst_id
      LEFT JOIN (
        SELECT dashboard_id,
          COUNT(*) FILTER (WHERE status <> 'done') AS active_count,
          COUNT(*) AS total_count
        FROM tasks
        WHERE owner_analyst_id = ${analystId} AND dashboard_id IS NOT NULL
        GROUP BY dashboard_id
      ) tc ON tc.dashboard_id = d.id
      WHERE w.analyst_id = ${analystId}
      ORDER BY d.priority NULLS LAST, d.name
    `;

    const result = rows.map((row: any) => ({
      ...mapDashboardRow(row),
      ownerName: row.analyst_name,
      isCovering: row.analyst_id !== analystId,
      activeTaskCount: Number(row.active_task_count),
      totalTaskCount: Number(row.total_task_count),
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('List worklist dashboards error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      analystId?: number;
      dashboardId?: number;
    };
    const { analystId, dashboardId } = body;

    if (analystId === undefined || analystId === null || dashboardId === undefined || dashboardId === null) {
      return NextResponse.json(
        { error: 'analystId and dashboardId are required.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO worklist_dashboards (analyst_id, dashboard_id)
      VALUES (${analystId}, ${dashboardId})
      ON CONFLICT (analyst_id, dashboard_id) DO NOTHING
      RETURNING id, analyst_id, dashboard_id, added_date
    `;

    if (rows.length === 0) {
      const existing = await sql`
        SELECT id, analyst_id, dashboard_id, added_date
        FROM worklist_dashboards
        WHERE analyst_id = ${analystId} AND dashboard_id = ${dashboardId}
      `;
      return NextResponse.json(mapWorklistDashboardRow(existing[0]), { status: 201 });
    }

    return NextResponse.json(mapWorklistDashboardRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create worklist dashboard error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced analystId/dashboardId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get('id');
    const analystIdParam = req.nextUrl.searchParams.get('analystId');
    const dashboardIdParam = req.nextUrl.searchParams.get('dashboardId');

    const id = idParam ? Number(idParam) : NaN;
    const analystId = analystIdParam ? Number(analystIdParam) : NaN;
    const dashboardId = dashboardIdParam ? Number(dashboardIdParam) : NaN;

    const hasId = !!idParam && Number.isFinite(id);
    const hasPair = !!analystIdParam && !!dashboardIdParam && Number.isFinite(analystId) && Number.isFinite(dashboardId);

    if (!hasId && !hasPair) {
      return NextResponse.json(
        { error: 'Provide either id, or both analystId and dashboardId.' },
        { status: 400 }
      );
    }

    const rows = hasId
      ? await sql`DELETE FROM worklist_dashboards WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM worklist_dashboards WHERE analyst_id = ${analystId} AND dashboard_id = ${dashboardId} RETURNING id`;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Worklist membership not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete worklist dashboard error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
