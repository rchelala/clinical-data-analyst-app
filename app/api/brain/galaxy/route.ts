import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchDashboardRowsWithStaleness, fetchSubscriptionRowsWithStaleness } from '@/lib/dashboard-queries';
import { mapAnalystRow } from '@/lib/brain-mappers';
import { computeUrgency, bucketUrgencies } from '@/lib/urgency';
import { AnalystSummary } from '@/lib/brain-types';

// Org-wide rollup for the Galaxy zoom level: one summary row per analyst,
// with division/dashboard/subscription counts and a high-urgency count
// computed from urgency terciles across the *entire* org (not per-analyst).
export async function GET() {
  try {
    const analystRows = await sql`SELECT id, name FROM analysts ORDER BY name`;
    const analysts = analystRows.map(mapAnalystRow);

    const divisionRows = await sql`
      SELECT id, created_by_analyst_id FROM divisions
    `;

    // Unscoped (org-wide) rows — same shared query used by the per-analyst
    // routes in app/api/dashboards/route.ts and app/api/report-subscriptions/route.ts.
    const dashboardRows = await fetchDashboardRowsWithStaleness();
    const subscriptionRows = await fetchSubscriptionRowsWithStaleness();

    // Combine dashboard + subscription rows into one urgency-driving set so
    // bucketUrgencies() classifies terciles across the whole org at once.
    const combinedRows = [...dashboardRows, ...subscriptionRows];
    const urgencyScores = combinedRows.map((row: any) =>
      computeUrgency(
        Number(row.days_stale),
        Number(row.open_request_count),
        Number(row.oldest_open_request_age_days)
      )
    );
    const buckets = bucketUrgencies(urgencyScores);

    // Per-analyst aggregation.
    const divisionIdsByAnalyst = new Map<number, Set<number>>();
    const dashboardCountByAnalyst = new Map<number, number>();
    const subscriptionCountByAnalyst = new Map<number, number>();
    const highUrgencyCountByAnalyst = new Map<number, number>();

    const addDivision = (analystId: number, divisionId: number) => {
      const existing = divisionIdsByAnalyst.get(analystId);
      if (existing) {
        existing.add(divisionId);
      } else {
        divisionIdsByAnalyst.set(analystId, new Set([divisionId]));
      }
    };

    // Divisions an analyst created/owns directly.
    for (const division of divisionRows as any[]) {
      if (division.created_by_analyst_id !== null) {
        addDivision(Number(division.created_by_analyst_id), Number(division.id));
      }
    }

    combinedRows.forEach((row: any, i: number) => {
      const analystId = row.analyst_id !== null ? Number(row.analyst_id) : null;
      if (analystId === null) return;

      addDivision(analystId, Number(row.division_id));

      const isDashboard = i < dashboardRows.length;
      if (isDashboard) {
        dashboardCountByAnalyst.set(analystId, (dashboardCountByAnalyst.get(analystId) ?? 0) + 1);
      } else {
        subscriptionCountByAnalyst.set(analystId, (subscriptionCountByAnalyst.get(analystId) ?? 0) + 1);
      }

      if (buckets[i] === 'high') {
        highUrgencyCountByAnalyst.set(analystId, (highUrgencyCountByAnalyst.get(analystId) ?? 0) + 1);
      }
    });

    const summaries: AnalystSummary[] = analysts.map((analyst) => ({
      id: analyst.id,
      name: analyst.name,
      divisionCount: divisionIdsByAnalyst.get(analyst.id)?.size ?? 0,
      dashboardCount: dashboardCountByAnalyst.get(analyst.id) ?? 0,
      subscriptionCount: subscriptionCountByAnalyst.get(analyst.id) ?? 0,
      highUrgencyCount: highUrgencyCountByAnalyst.get(analyst.id) ?? 0,
    }));

    return NextResponse.json(summaries);
  } catch (err: unknown) {
    console.error('Galaxy summary error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
