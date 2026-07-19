import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  DivisionDetailDashboard,
  DivisionDetailRequest,
  DivisionDetailResponse,
  DivisionDetailSubscription,
  DivisionDetailTask,
} from '@/lib/brain-types';

// Division Detail page: one division's dashboards, report subscriptions, and
// the requests/tasks attached underneath them.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ divisionId: string }> }
) {
  try {
    const { divisionId: divisionIdParam } = await params;
    const divisionId = Number(divisionIdParam);
    if (!Number.isFinite(divisionId)) {
      return NextResponse.json({ error: 'Invalid division id.' }, { status: 400 });
    }

    // (a) Division row (404 if missing).
    const divisionRows = await sql`
      SELECT id, name FROM divisions WHERE id = ${divisionId}
    `;

    if (divisionRows.length === 0) {
      return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
    }

    const divisionRow = divisionRows[0] as any;

    const [dashboardRows, subscriptionRows, requestRows, taskRows] = await Promise.all([
      // (b) Dashboards in this division, with owner name and open-request count.
      sql`
        SELECT
          d.id, d.name, d.status, d.last_touched_date,
          owner.name AS owner_name,
          COALESCE(oc.open_request_count, 0) AS open_request_count
        FROM dashboards d
        LEFT JOIN analysts owner ON owner.id = d.analyst_id
        LEFT JOIN (
          SELECT dashboard_id, COUNT(*) AS open_request_count
          FROM requests
          WHERE dashboard_id IS NOT NULL AND status <> 'done'
          GROUP BY dashboard_id
        ) oc ON oc.dashboard_id = d.id
        WHERE d.division_id = ${divisionId}
        ORDER BY (d.status = 'active') DESC, d.name
      `,

      // (c) Report subscriptions in this division, with owner name and open-request count.
      sql`
        SELECT
          s.id, s.name, s.status, s.last_touched_date,
          owner.name AS owner_name,
          COALESCE(oc.open_request_count, 0) AS open_request_count
        FROM report_subscriptions s
        LEFT JOIN analysts owner ON owner.id = s.analyst_id
        LEFT JOIN (
          SELECT subscription_id, COUNT(*) AS open_request_count
          FROM requests
          WHERE subscription_id IS NOT NULL AND status <> 'done'
          GROUP BY subscription_id
        ) oc ON oc.subscription_id = s.id
        WHERE s.division_id = ${divisionId}
        ORDER BY (s.status = 'active') DESC, s.name
      `,

      // (d) All requests on this division's dashboards/subscriptions, joined to
      // parent name and creator (owner) name.
      sql`
        SELECT
          r.id, r.title, r.request_type, r.status, r.created_date, r.completed_date,
          CASE
            WHEN r.dashboard_id IS NOT NULL THEN 'dashboard'
            ELSE 'subscription'
          END AS parent_kind,
          COALESCE(d.name, s.name) AS parent_name,
          creator.name AS owner_name
        FROM requests r
        LEFT JOIN dashboards d ON d.id = r.dashboard_id
        LEFT JOIN report_subscriptions s ON s.id = r.subscription_id
        LEFT JOIN analysts creator ON creator.id = r.created_by_id
        WHERE d.division_id = ${divisionId} OR s.division_id = ${divisionId}
        ORDER BY r.created_date DESC
      `,

      // (e) All tasks on this division's dashboards/subscriptions, plus
      // division-level tasks. Excludes psq-only tasks.
      sql`
        SELECT
          t.id, t.title, t.status, t.created_date, t.completed_date,
          CASE
            WHEN t.dashboard_id IS NOT NULL THEN 'dashboard'
            WHEN t.subscription_id IS NOT NULL THEN 'subscription'
            ELSE 'division'
          END AS context_kind,
          COALESCE(d.name, s.name, dv.name) AS context_name,
          owner.name AS owner_name
        FROM tasks t
        LEFT JOIN dashboards d ON d.id = t.dashboard_id
        LEFT JOIN report_subscriptions s ON s.id = t.subscription_id
        LEFT JOIN divisions dv ON dv.id = t.division_id
        LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
        WHERE t.division_id = ${divisionId} OR d.division_id = ${divisionId} OR s.division_id = ${divisionId}
        ORDER BY t.created_date DESC
      `,
    ]);

    const dashboards: DivisionDetailDashboard[] = (dashboardRows as any[]).map((row) => ({
      id: Number(row.id),
      name: row.name,
      status: row.status,
      ownerName: row.owner_name,
      lastTouchedDate: row.last_touched_date,
      openRequestCount: Number(row.open_request_count),
    }));

    const subscriptions: DivisionDetailSubscription[] = (subscriptionRows as any[]).map((row) => ({
      id: Number(row.id),
      name: row.name,
      status: row.status,
      ownerName: row.owner_name,
      lastTouchedDate: row.last_touched_date,
      openRequestCount: Number(row.open_request_count),
    }));

    const requests: DivisionDetailRequest[] = (requestRows as any[]).map((row) => ({
      id: Number(row.id),
      title: row.title,
      requestType: row.request_type,
      status: row.status,
      ownerName: row.owner_name,
      parentKind: row.parent_kind,
      parentName: row.parent_name,
      createdDate: row.created_date,
      completedDate: row.completed_date,
    }));

    const tasks: DivisionDetailTask[] = (taskRows as any[]).map((row) => ({
      id: Number(row.id),
      title: row.title,
      status: row.status,
      ownerName: row.owner_name,
      contextKind: row.context_kind,
      contextName: row.context_name,
      createdDate: row.created_date,
      completedDate: row.completed_date,
    }));

    const response: DivisionDetailResponse = {
      id: Number(divisionRow.id),
      name: divisionRow.name,
      dashboards,
      subscriptions,
      requests,
      tasks,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error('Division detail error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
