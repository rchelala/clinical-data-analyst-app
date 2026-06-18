import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapRequestRow, mapRequestWithCreatorRow } from '@/lib/brain-mappers';
import { RequestType } from '@/lib/brain-types';

const VALID_REQUEST_TYPES = ['feature', 'bug', 'field_request'] as const;

export async function GET(req: NextRequest) {
  try {
    const dashboardIdParam = req.nextUrl.searchParams.get('dashboardId');
    const subscriptionIdParam = req.nextUrl.searchParams.get('subscriptionId');

    const dashboardId = dashboardIdParam ? Number(dashboardIdParam) : NaN;
    const subscriptionId = subscriptionIdParam ? Number(subscriptionIdParam) : NaN;

    const hasDashboardId = !!dashboardIdParam && Number.isFinite(dashboardId);
    const hasSubscriptionId = !!subscriptionIdParam && Number.isFinite(subscriptionId);

    if (hasDashboardId === hasSubscriptionId) {
      return NextResponse.json(
        { error: 'Provide exactly one of dashboardId or subscriptionId query params, and it must be numeric.' },
        { status: 400 }
      );
    }

    const rows = hasDashboardId
      ? await sql`
          SELECT
            r.id,
            r.dashboard_id,
            r.subscription_id,
            r.created_by_id,
            r.title,
            r.description,
            r.request_type,
            r.status,
            r.jira_ticket_id,
            r.created_date,
            r.completed_date,
            a.name AS created_by_name
          FROM requests r
          JOIN analysts a ON a.id = r.created_by_id
          WHERE r.dashboard_id = ${dashboardId}
          ORDER BY r.created_date DESC
        `
      : await sql`
          SELECT
            r.id,
            r.dashboard_id,
            r.subscription_id,
            r.created_by_id,
            r.title,
            r.description,
            r.request_type,
            r.status,
            r.jira_ticket_id,
            r.created_date,
            r.completed_date,
            a.name AS created_by_name
          FROM requests r
          JOIN analysts a ON a.id = r.created_by_id
          WHERE r.subscription_id = ${subscriptionId}
          ORDER BY r.created_date DESC
        `;

    return NextResponse.json(rows.map(mapRequestWithCreatorRow));
  } catch (err: unknown) {
    console.error('List requests error:', err);
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
      title?: string;
      description?: string;
      requestType?: string;
      jiraTicketId?: string;
    };

    const { dashboardId, subscriptionId, title, description, requestType, jiraTicketId } = body;

    const hasDashboardId = dashboardId !== undefined && dashboardId !== null;
    const hasSubscriptionId = subscriptionId !== undefined && subscriptionId !== null;

    if (hasDashboardId === hasSubscriptionId) {
      return NextResponse.json(
        { error: 'Provide exactly one of dashboardId or subscriptionId.' },
        { status: 400 }
      );
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'title is required.' },
        { status: 400 }
      );
    }

    if (requestType !== undefined && !VALID_REQUEST_TYPES.includes(requestType as RequestType)) {
      return NextResponse.json(
        { error: `requestType must be one of: ${VALID_REQUEST_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO requests (dashboard_id, subscription_id, created_by_id, title, description, request_type, jira_ticket_id)
      VALUES (${dashboardId ?? null}, ${subscriptionId ?? null}, ${createdById}, ${title}, ${description ?? null}, ${requestType ?? 'feature'}, ${jiraTicketId ?? null})
      RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date
    `;

    return NextResponse.json(mapRequestRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Referenced dashboardId/subscriptionId does not exist' },
          { status: 400 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          { error: 'Provide exactly one of dashboardId or subscriptionId.' },
          { status: 400 }
        );
      }
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
