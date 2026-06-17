import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapReportSubscriptionRow } from '@/lib/brain-mappers';
import { computeUrgency, normalizeRadius } from '@/lib/urgency';
import { ReportSubscriptionWithUrgency } from '@/lib/brain-types';

export async function GET(req: NextRequest) {
  try {
    const analystIdHeader = req.headers.get('x-analyst-id');
    const analystId = analystIdHeader ? Number(analystIdHeader) : null;

    // Aggregate open-request stats per subscription in one round trip, then
    // join onto report_subscriptions, so we avoid N+1 queries. `daysStale`
    // and `oldestOpenRequestAgeDays` are computed in SQL as integer day diffs.
    const rows = analystId
      ? await sql`
          SELECT
            s.id,
            s.name,
            s.division_id,
            s.analyst_id,
            s.stakeholder,
            s.status,
            s.jira_ticket_id,
            s.last_touched_date,
            s.created_date,
            COALESCE(agg.open_request_count, 0) AS open_request_count,
            (CURRENT_DATE - s.last_touched_date) AS days_stale,
            COALESCE(agg.oldest_open_request_age_days, 0) AS oldest_open_request_age_days
          FROM report_subscriptions s
          LEFT JOIN (
            SELECT
              subscription_id,
              COUNT(*) AS open_request_count,
              MAX(CURRENT_DATE - created_date) AS oldest_open_request_age_days
            FROM requests
            WHERE status != 'done'
            GROUP BY subscription_id
          ) agg ON agg.subscription_id = s.id
          WHERE s.analyst_id = ${analystId}
        `
      : await sql`
          SELECT
            s.id,
            s.name,
            s.division_id,
            s.analyst_id,
            s.stakeholder,
            s.status,
            s.jira_ticket_id,
            s.last_touched_date,
            s.created_date,
            COALESCE(agg.open_request_count, 0) AS open_request_count,
            (CURRENT_DATE - s.last_touched_date) AS days_stale,
            COALESCE(agg.oldest_open_request_age_days, 0) AS oldest_open_request_age_days
          FROM report_subscriptions s
          LEFT JOIN (
            SELECT
              subscription_id,
              COUNT(*) AS open_request_count,
              MAX(CURRENT_DATE - created_date) AS oldest_open_request_age_days
            FROM requests
            WHERE status != 'done'
            GROUP BY subscription_id
          ) agg ON agg.subscription_id = s.id
        `;

    const urgencyScores = rows.map((row: any) =>
      computeUrgency(
        Number(row.days_stale),
        Number(row.open_request_count),
        Number(row.oldest_open_request_age_days)
      )
    );

    // Normalize across the *entire* returned set in a single call, not per-row.
    const radii = normalizeRadius(urgencyScores);

    const subscriptions: ReportSubscriptionWithUrgency[] = rows.map((row: any, i: number) => ({
      ...mapReportSubscriptionRow(row),
      openRequestCount: Number(row.open_request_count),
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
