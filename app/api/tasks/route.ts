import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTaskRow, mapTaskWithContextRow } from '@/lib/brain-mappers';

export async function GET(req: NextRequest) {
  try {
    const dashboardIdParam = req.nextUrl.searchParams.get('dashboardId');
    const subscriptionIdParam = req.nextUrl.searchParams.get('subscriptionId');
    const divisionIdParam = req.nextUrl.searchParams.get('divisionId');
    const psqIdParam = req.nextUrl.searchParams.get('psqId');
    const ownerAnalystIdParam = req.nextUrl.searchParams.get('ownerAnalystId');
    const assignedToParam = req.nextUrl.searchParams.get('assignedTo');
    const excludeWorklistOfParam = req.nextUrl.searchParams.get('excludeWorklistOf');

    const dashboardId = dashboardIdParam ? Number(dashboardIdParam) : NaN;
    const subscriptionId = subscriptionIdParam ? Number(subscriptionIdParam) : NaN;
    const divisionId = divisionIdParam ? Number(divisionIdParam) : NaN;
    const psqId = psqIdParam ? Number(psqIdParam) : NaN;
    const ownerAnalystId = ownerAnalystIdParam ? Number(ownerAnalystIdParam) : NaN;
    const assignedTo = assignedToParam ? Number(assignedToParam) : NaN;
    const excludeWorklistOf = excludeWorklistOfParam ? Number(excludeWorklistOfParam) : NaN;

    const hasDashboardId = !!dashboardIdParam && Number.isFinite(dashboardId);
    const hasSubscriptionId = !!subscriptionIdParam && Number.isFinite(subscriptionId);
    const hasDivisionId = !!divisionIdParam && Number.isFinite(divisionId);
    const hasPsqId = !!psqIdParam && Number.isFinite(psqId);
    const hasOwnerAnalystId = !!ownerAnalystIdParam && Number.isFinite(ownerAnalystId);
    const hasAssignedTo = !!assignedToParam && Number.isFinite(assignedTo);
    const hasExcludeWorklistOf = !!excludeWorklistOfParam && Number.isFinite(excludeWorklistOf);

    if (hasDashboardId) {
      const rows = hasOwnerAnalystId
        ? await sql`
            SELECT t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description, t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment, owner.name AS owner_name
            FROM tasks t
            LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
            WHERE t.dashboard_id = ${dashboardId} AND t.owner_analyst_id = ${ownerAnalystId}
            ORDER BY t.created_date DESC
          `
        : await sql`
            SELECT t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description, t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment, owner.name AS owner_name
            FROM tasks t
            LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
            WHERE t.dashboard_id = ${dashboardId}
            ORDER BY t.created_date DESC
          `;

      return NextResponse.json(rows.map(mapTaskRow));
    }

    if (hasSubscriptionId) {
      const rows = hasOwnerAnalystId
        ? await sql`
            SELECT t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description, t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment, owner.name AS owner_name
            FROM tasks t
            LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
            WHERE t.subscription_id = ${subscriptionId} AND t.owner_analyst_id = ${ownerAnalystId}
            ORDER BY t.created_date DESC
          `
        : await sql`
            SELECT t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description, t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment, owner.name AS owner_name
            FROM tasks t
            LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
            WHERE t.subscription_id = ${subscriptionId}
            ORDER BY t.created_date DESC
          `;

      return NextResponse.json(rows.map(mapTaskRow));
    }

    if (hasDivisionId) {
      const rows = await sql`
        SELECT t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description, t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment, owner.name AS owner_name
        FROM tasks t
        LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
        WHERE t.division_id = ${divisionId}
        ORDER BY t.created_date DESC
      `;

      return NextResponse.json(rows.map(mapTaskRow));
    }

    if (hasPsqId) {
      const rows = hasOwnerAnalystId
        ? await sql`
            SELECT id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
            FROM tasks
            WHERE psq_id = ${psqId} AND owner_analyst_id = ${ownerAnalystId}
            ORDER BY created_date DESC
          `
        : await sql`
            SELECT id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
            FROM tasks
            WHERE psq_id = ${psqId}
            ORDER BY created_date DESC
          `;

      return NextResponse.json(rows.map(mapTaskRow));
    }

    if (hasAssignedTo && hasExcludeWorklistOf) {
      const rows = await sql`
        SELECT
          t.id, t.dashboard_id, t.subscription_id, t.division_id, t.psq_id, t.owner_analyst_id, t.created_by_id, t.title, t.description,
          t.status, t.priority, t.created_date, t.completed_date, t.resolution_comment,
          CASE
            WHEN t.dashboard_id IS NOT NULL THEN 'dashboard'
            WHEN t.subscription_id IS NOT NULL THEN 'subscription'
            WHEN t.psq_id IS NOT NULL THEN 'psq'
            ELSE 'division'
          END AS context_type,
          COALESCE(d.name, s.name, ps.name, dv.name) AS context_name,
          COALESCE(dashboard_owner.name, subscription_owner.name) AS context_owner_name,
          owner.name AS owner_name
        FROM tasks t
        LEFT JOIN dashboards d ON d.id = t.dashboard_id
        LEFT JOIN report_subscriptions s ON s.id = t.subscription_id
        LEFT JOIN divisions dv ON dv.id = t.division_id
        LEFT JOIN psqs ps ON ps.id = t.psq_id
        LEFT JOIN analysts dashboard_owner ON dashboard_owner.id = d.analyst_id
        LEFT JOIN analysts subscription_owner ON subscription_owner.id = s.analyst_id
        LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
        WHERE t.owner_analyst_id = ${assignedTo}
          AND (
            t.dashboard_id IS NULL
            OR t.dashboard_id NOT IN (
              SELECT dashboard_id FROM worklist_dashboards WHERE analyst_id = ${excludeWorklistOf}
            )
          )
          -- Exclude tasks on the analyst's own report subscriptions; those
          -- already show under the subscription's row in the main section.
          AND (
            t.subscription_id IS NULL
            OR t.subscription_id NOT IN (
              SELECT id FROM report_subscriptions WHERE analyst_id = ${excludeWorklistOf}
            )
          )
          -- Exclude tasks on the analyst's own PSQs; those already show in the PSQ section.
          AND (
            t.psq_id IS NULL
            OR t.psq_id NOT IN (
              SELECT id FROM psqs WHERE analyst_id = ${excludeWorklistOf}
            )
          )
        ORDER BY t.created_date DESC
      `;

      return NextResponse.json(rows.map(mapTaskWithContextRow));
    }

    return NextResponse.json(
      {
        error:
          'Provide dashboardId, subscriptionId, psqId, or divisionId (optionally with ownerAnalystId), or both assignedTo and excludeWorklistOf.',
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
      subscriptionId?: number;
      divisionId?: number;
      psqId?: number;
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      ownerAnalystId?: number;
    };

    const { dashboardId, subscriptionId, divisionId, psqId, title, description, status, priority, ownerAnalystId } = body;

    const hasDashboardId = dashboardId !== undefined && dashboardId !== null;
    const hasSubscriptionId = subscriptionId !== undefined && subscriptionId !== null;
    const hasDivisionId = divisionId !== undefined && divisionId !== null;
    const hasPsqId = psqId !== undefined && psqId !== null;

    if (Number(hasDashboardId) + Number(hasSubscriptionId) + Number(hasDivisionId) + Number(hasPsqId) !== 1) {
      return NextResponse.json(
        { error: 'Provide exactly one of dashboardId, subscriptionId, divisionId, or psqId.' },
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
      INSERT INTO tasks (dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority)
      VALUES (${dashboardId ?? null}, ${subscriptionId ?? null}, ${divisionId ?? null}, ${psqId ?? null}, ${ownerAnalystId ?? createdById}, ${createdById}, ${title}, ${description ?? null}, ${status ?? 'open'}, ${priority ?? null})
      RETURNING id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
    `;

    return NextResponse.json(mapTaskRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create task error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Referenced dashboardId/subscriptionId/divisionId/psqId/ownerAnalystId does not exist' },
          { status: 400 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          { error: 'Provide exactly one of dashboardId, subscriptionId, divisionId, or psqId.' },
          { status: 400 }
        );
      }
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
