import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTaskRow, mapTaskWithContextRow } from '@/lib/brain-mappers';

export async function GET(req: NextRequest) {
  try {
    const dashboardIdParam = req.nextUrl.searchParams.get('dashboardId');
    const ownerAnalystIdParam = req.nextUrl.searchParams.get('ownerAnalystId');
    const assignedToParam = req.nextUrl.searchParams.get('assignedTo');
    const excludeWorklistOfParam = req.nextUrl.searchParams.get('excludeWorklistOf');

    const dashboardId = dashboardIdParam ? Number(dashboardIdParam) : NaN;
    const ownerAnalystId = ownerAnalystIdParam ? Number(ownerAnalystIdParam) : NaN;
    const assignedTo = assignedToParam ? Number(assignedToParam) : NaN;
    const excludeWorklistOf = excludeWorklistOfParam ? Number(excludeWorklistOfParam) : NaN;

    const hasDashboardId = !!dashboardIdParam && Number.isFinite(dashboardId);
    const hasOwnerAnalystId = !!ownerAnalystIdParam && Number.isFinite(ownerAnalystId);
    const hasAssignedTo = !!assignedToParam && Number.isFinite(assignedTo);
    const hasExcludeWorklistOf = !!excludeWorklistOfParam && Number.isFinite(excludeWorklistOf);

    if (hasDashboardId) {
      const rows = hasOwnerAnalystId
        ? await sql`
            SELECT id, dashboard_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date
            FROM tasks
            WHERE dashboard_id = ${dashboardId} AND owner_analyst_id = ${ownerAnalystId}
            ORDER BY created_date DESC
          `
        : await sql`
            SELECT id, dashboard_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date
            FROM tasks
            WHERE dashboard_id = ${dashboardId}
            ORDER BY created_date DESC
          `;

      return NextResponse.json(rows.map(mapTaskRow));
    }

    if (hasAssignedTo && hasExcludeWorklistOf) {
      const rows = await sql`
        SELECT
          t.id, t.dashboard_id, t.owner_analyst_id, t.created_by_id, t.title, t.description,
          t.status, t.priority, t.created_date, t.completed_date,
          d.name AS dashboard_name,
          dashboard_owner.name AS dashboard_owner_name,
          owner.name AS owner_name
        FROM tasks t
        JOIN dashboards d ON d.id = t.dashboard_id
        LEFT JOIN analysts dashboard_owner ON dashboard_owner.id = d.analyst_id
        LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
        WHERE t.owner_analyst_id = ${assignedTo}
          AND t.dashboard_id NOT IN (
            SELECT dashboard_id FROM worklist_dashboards WHERE analyst_id = ${excludeWorklistOf}
          )
        ORDER BY t.created_date DESC
      `;

      return NextResponse.json(rows.map(mapTaskWithContextRow));
    }

    return NextResponse.json(
      {
        error:
          'Provide dashboardId (optionally with ownerAnalystId), or both assignedTo and excludeWorklistOf.',
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error('List tasks error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const analystIdHeader = req.headers.get('x-analyst-id');
    if (!analystIdHeader) {
      return NextResponse.json(
        { error: 'x-analyst-id header is required.' },
        { status: 400 }
      );
    }
    const createdById = Number(analystIdHeader);
    if (!Number.isFinite(createdById)) {
      return NextResponse.json(
        { error: 'x-analyst-id header must be numeric.' },
        { status: 400 }
      );
    }

    const body = await req.json() as {
      dashboardId?: number;
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      ownerAnalystId?: number;
    };

    const { dashboardId, title, description, status, priority, ownerAnalystId } = body;

    if (dashboardId === undefined || dashboardId === null) {
      return NextResponse.json(
        { error: 'dashboardId is required.' },
        { status: 400 }
      );
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'title is required.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO tasks (dashboard_id, owner_analyst_id, created_by_id, title, description, status, priority)
      VALUES (${dashboardId}, ${ownerAnalystId ?? createdById}, ${createdById}, ${title}, ${description ?? null}, ${status ?? 'open'}, ${priority ?? null})
      RETURNING id, dashboard_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date
    `;

    return NextResponse.json(mapTaskRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create task error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced dashboardId/ownerAnalystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
