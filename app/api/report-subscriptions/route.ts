import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchSubscriptionRowsWithStaleness } from '@/lib/dashboard-queries';
import { mapReportSubscriptionRow } from '@/lib/brain-mappers';
import { computeUrgency, normalizeRadius } from '@/lib/urgency';
import { ReportSubscriptionWithUrgency } from '@/lib/brain-types';

export async function GET(req: NextRequest) {
  try {
    const analystIdHeader = req.headers.get('x-analyst-id');
    const analystId = analystIdHeader ? Number(analystIdHeader) : null;

    const rows = await fetchSubscriptionRowsWithStaleness(analystId ?? undefined);

    const urgencyScores = rows.map((row: any) =>
      computeUrgency(
        Number(row.days_stale),
        Number(row.open_request_count),
        Number(row.in_progress_request_count),
        Number(row.oldest_open_request_age_days)
      )
    );

    // Normalize across the *entire* returned set in a single call, not per-row.
    const radii = normalizeRadius(urgencyScores);

    const subscriptions: ReportSubscriptionWithUrgency[] = rows.map((row: any, i: number) => ({
      ...mapReportSubscriptionRow(row),
      openRequestCount: Number(row.open_request_count),
      inProgressRequestCount: Number(row.in_progress_request_count),
      urgency: urgencyScores[i],
      radius: radii[i],
    }));

    return NextResponse.json(subscriptions);
  } catch (err: unknown) {
    console.error('List report subscriptions error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name?: string;
      divisionId?: number;
      analystId?: number;
      stakeholder?: string;
      jiraTicketId?: string;
      linkedDashboardId?: number | null;
    };

    const { name, divisionId, analystId, stakeholder, jiraTicketId, linkedDashboardId } = body;

    if (!name?.trim() || divisionId === undefined || divisionId === null) {
      return NextResponse.json(
        { error: 'name and divisionId are required.' },
        { status: 400 }
      );
    }

    if (linkedDashboardId !== undefined && linkedDashboardId !== null) {
      const linkedDashboardRows = await sql`
        SELECT division_id FROM dashboards WHERE id = ${linkedDashboardId}
      `;
      if (linkedDashboardRows.length === 0) {
        return NextResponse.json(
          { error: 'linkedDashboardId does not refer to an existing dashboard.' },
          { status: 400 }
        );
      }
      if (linkedDashboardRows[0].division_id !== divisionId) {
        return NextResponse.json(
          { error: 'linkedDashboardId must be a dashboard in the same division.' },
          { status: 400 }
        );
      }
    }

    const rows = await sql`
      INSERT INTO report_subscriptions (name, division_id, analyst_id, stakeholder, jira_ticket_id, linked_dashboard_id)
      VALUES (${name}, ${divisionId}, ${analystId ?? null}, ${stakeholder ?? null}, ${jiraTicketId ?? null}, ${linkedDashboardId ?? null})
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, linked_dashboard_id
    `;

    return NextResponse.json(mapReportSubscriptionRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create report subscription error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
