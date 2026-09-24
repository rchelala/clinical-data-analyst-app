import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchDashboardRowsWithStaleness, fetchSubscriptionRowsWithStaleness } from '@/lib/dashboard-queries';
import { mapAnalystRow } from '@/lib/brain-mappers';
import { computeUrgency, bucketUrgencies, resolveBucket } from '@/lib/urgency';
import { AnalystSummary, UrgencyBucket } from '@/lib/brain-types';

// Org-wide rollup for the Galaxy zoom level: one summary row per analyst,
// with division/dashboard/subscription counts and a high-urgency count
// computed from urgency terciles across the *entire* org (not per-analyst).
export async function GET() {
  try {
    // These four queries are independent of one another — run them
    // concurrently instead of paying for four sequential round trips.
    const [analystRows, divisionRows, dashboardRows, subscriptionRows] = await Promise.all([
      sql`SELECT id, name, is_active FROM analysts ORDER BY name`,
      sql`SELECT id, created_by_analyst_id FROM divisions`,
      // Unscoped (org-wide) rows — same shared query used by the per-analyst
      // routes in app/api/dashboards/route.ts and app/api/report-subscriptions/route.ts.
      fetchDashboardRowsWithStaleness(),
      fetchSubscriptionRowsWithStaleness(),
    ]);
    const analysts = analystRows.map(mapAnalystRow);

    // Combine dashboard + subscription rows into one urgency-driving set so
    // bucketUrgencies() classifies terciles across the whole org at once.
    const combinedRows = [...dashboardRows, ...subscriptionRows];
    const urgencyScores = combinedRows.map((row: any) =>
      computeUrgency(
        Number(row.days_stale),
        Number(row.open_request_count),
        Number(row.in_progress_request_count),
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

      const resolvedBucket = resolveBucket(
        buckets[i],
        (row.manual_urgency ?? null) as UrgencyBucket | null
      );
      if (resolvedBucket === 'high') {
        highUrgencyCountByAnalyst.set(analystId, (highUrgencyCountByAnalyst.get(analystId) ?? 0) + 1);
      }
    });

    // A retired analyst keeps their star only while they still own something
    // here, so un-reassigned work never silently vanishes from the org view.
    // Note these counts cover divisions/dashboards/subscriptions and NOT tasks,
    // so someone who owned only tasks drops off the Galaxy — their tasks still
    // show their name everywhere else.
    const summaries: AnalystSummary[] = [];

    for (const analyst of analysts) {
      const summary: AnalystSummary = {
        id: analyst.id,
        name: analyst.name,
        divisionCount: divisionIdsByAnalyst.get(analyst.id)?.size ?? 0,
        dashboardCount: dashboardCountByAnalyst.get(analyst.id) ?? 0,
        subscriptionCount: subscriptionCountByAnalyst.get(analyst.id) ?? 0,
        highUrgencyCount: highUrgencyCountByAnalyst.get(analyst.id) ?? 0,
      };

      const ownsSomething =
        summary.divisionCount > 0 ||
        summary.dashboardCount > 0 ||
        summary.subscriptionCount > 0;

      if (analyst.isActive || ownsSomething) summaries.push(summary);
    }

    return NextResponse.json(summaries);
  } catch (err: unknown) {
    console.error('Galaxy summary error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
