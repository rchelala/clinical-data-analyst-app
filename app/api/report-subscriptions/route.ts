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
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
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
    };

    const { name, divisionId, analystId, stakeholder, jiraTicketId } = body;

    if (!name?.trim() || divisionId === undefined || divisionId === null) {
      return NextResponse.json(
        { error: 'name and divisionId are required.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO report_subscriptions (name, division_id, analyst_id, stakeholder, jira_ticket_id)
      VALUES (${name}, ${divisionId}, ${analystId ?? null}, ${stakeholder ?? null}, ${jiraTicketId ?? null})
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
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
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
