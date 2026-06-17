import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDashboardRow } from '@/lib/brain-mappers';
import { computeUrgency, normalizeRadius } from '@/lib/urgency';
import { DashboardWithUrgency } from '@/lib/brain-types';

export async function GET(req: NextRequest) {
  try {
    const analystIdHeader = req.headers.get('x-analyst-id');
    const analystId = analystIdHeader ? Number(analystIdHeader) : null;

    // Aggregate open-request stats per dashboard in one round trip, then join
    // onto dashboards, so we avoid N+1 queries. `daysStale` and
    // `oldestOpenRequestAgeDays` are computed in SQL as integer day diffs.
    const rows = analystId
      ? await sql`
          SELECT
            d.id,
            d.name,
            d.division_id,
            d.analyst_id,
            d.stakeholder,
            d.status,
            d.jira_ticket_id,
            d.last_touched_date,
            d.created_date,
            COALESCE(agg.open_request_count, 0) AS open_request_count,
            (CURRENT_DATE - d.last_touched_date) AS days_stale,
            COALESCE(agg.oldest_open_request_age_days, 0) AS oldest_open_request_age_days
          FROM dashboards d
          LEFT JOIN (
            SELECT
              dashboard_id,
              COUNT(*) AS open_request_count,
              MAX(CURRENT_DATE - created_date) AS oldest_open_request_age_days
            FROM requests
            WHERE status != 'done'
            GROUP BY dashboard_id
          ) agg ON agg.dashboard_id = d.id
          WHERE d.analyst_id = ${analystId}
        `
      : await sql`
          SELECT
            d.id,
            d.name,
            d.division_id,
            d.analyst_id,
            d.stakeholder,
            d.status,
            d.jira_ticket_id,
            d.last_touched_date,
            d.created_date,
            COALESCE(agg.open_request_count, 0) AS open_request_count,
            (CURRENT_DATE - d.last_touched_date) AS days_stale,
            COALESCE(agg.oldest_open_request_age_days, 0) AS oldest_open_request_age_days
          FROM dashboards d
          LEFT JOIN (
            SELECT
              dashboard_id,
              COUNT(*) AS open_request_count,
              MAX(CURRENT_DATE - created_date) AS oldest_open_request_age_days
            FROM requests
            WHERE status != 'done'
            GROUP BY dashboard_id
          ) agg ON agg.dashboard_id = d.id
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

    const dashboards: DashboardWithUrgency[] = rows.map((row: any, i: number) => ({
      ...mapDashboardRow(row),
      openRequestCount: Number(row.open_request_count),
      urgency: urgencyScores[i],
      radius: radii[i],
    }));

    return NextResponse.json(dashboards);
  } catch (err: unknown) {
    console.error('List dashboards error:', err);
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
      INSERT INTO dashboards (name, division_id, analyst_id, stakeholder, jira_ticket_id)
      VALUES (${name}, ${divisionId}, ${analystId ?? null}, ${stakeholder ?? null}, ${jiraTicketId ?? null})
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    `;

    return NextResponse.json(mapDashboardRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create dashboard error:', err);
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
