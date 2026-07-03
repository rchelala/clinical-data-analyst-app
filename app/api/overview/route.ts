import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  DivisionOverview,
  EngagementTier,
  OverviewResponse,
  OverviewThroughputPoint,
  OverviewTotals,
} from '@/lib/brain-types';

// Engagement score weights/thresholds. Each signal is normalized to 0..1,
// then blended with these weights and scaled to 0..100. Kept as named
// consts so the formula stays legible without digging through the query.
const SUBSCRIPTIONS_WEIGHT = 0.3;
const DASHBOARDS_WEIGHT = 0.25;
const DEMAND_WEIGHT = 0.2;
const RECENCY_WEIGHT = 0.25;

const SUBSCRIPTIONS_SIGNAL_CAP = 5;
const DASHBOARDS_SIGNAL_CAP = 5;
const DEMAND_SIGNAL_CAP = 10;

const RECENCY_RECENT_DAYS = 30;   // full recency credit
const RECENCY_WARM_DAYS = 90;     // partial recency credit
const RECENCY_STALE_DAYS = 180;   // minimal recency credit; beyond this, none

const ACTIVE_TIER_THRESHOLD = 60;
const WARM_TIER_THRESHOLD = 30;

// Division Overview page: team-wide totals, a per-division engagement rollup,
// and a 6-month throughput trend (requests/tasks completed per month).
export async function GET() {
  try {
    // (a) Divisions (the full set every division must appear in the output).
    const divisionRows = await sql`
      SELECT id, name FROM divisions ORDER BY sort_order, name
    `;

    // (b) Per-division dashboard counts (active = status <> 'retired').
    const dashboardCountRows = await sql`
      SELECT
        division_id,
        COUNT(*) FILTER (WHERE status <> 'retired') AS active_count,
        COUNT(*) AS total_count
      FROM dashboards
      GROUP BY division_id
    `;

    // (c) Per-division subscription counts (active = status <> 'retired').
    const subscriptionCountRows = await sql`
      SELECT
        division_id,
        COUNT(*) FILTER (WHERE status <> 'retired') AS active_count,
        COUNT(*) AS total_count
      FROM report_subscriptions
      GROUP BY division_id
    `;

    // (d) Per-division request counts, joined through whichever parent
    // (dashboard or subscription) the request attaches to.
    const requestCountRows = await sql`
      SELECT
        COALESCE(d.division_id, s.division_id) AS division_id,
        COUNT(*) FILTER (WHERE r.status = 'open') AS open_count,
        COUNT(*) FILTER (WHERE r.status = 'in_progress') AS in_progress_count,
        COUNT(*) FILTER (WHERE r.status = 'done') AS completed_count
      FROM requests r
      LEFT JOIN dashboards d ON d.id = r.dashboard_id
      LEFT JOIN report_subscriptions s ON s.id = r.subscription_id
      GROUP BY COALESCE(d.division_id, s.division_id)
    `;

    // (e) Per-division task counts. Division comes from the task's own
    // division_id, or (if attached to a dashboard/subscription instead) via
    // that entity's division_id. Psq-only tasks have no division and are
    // excluded from this per-division rollup.
    const taskCountRows = await sql`
      SELECT
        COALESCE(t.division_id, d.division_id, s.division_id) AS division_id,
        COUNT(*) FILTER (WHERE t.status = 'open') AS open_count,
        COUNT(*) FILTER (WHERE t.status = 'done' OR t.completed_date IS NOT NULL) AS completed_count
      FROM tasks t
      LEFT JOIN dashboards d ON d.id = t.dashboard_id
      LEFT JOIN report_subscriptions s ON s.id = t.subscription_id
      WHERE t.psq_id IS NULL
      GROUP BY COALESCE(t.division_id, d.division_id, s.division_id)
    `;

    // (f) Per-division last activity: latest of dashboard/subscription
    // last_touched_date, and request/task completed_date, for that division.
    const lastActivityRows = await sql`
      SELECT division_id, MAX(activity_date) AS last_activity_date
      FROM (
        SELECT division_id, last_touched_date AS activity_date FROM dashboards
        UNION ALL
        SELECT division_id, last_touched_date AS activity_date FROM report_subscriptions
        UNION ALL
        SELECT COALESCE(d.division_id, s.division_id) AS division_id, r.completed_date AS activity_date
        FROM requests r
        LEFT JOIN dashboards d ON d.id = r.dashboard_id
        LEFT JOIN report_subscriptions s ON s.id = r.subscription_id
        WHERE r.completed_date IS NOT NULL
        UNION ALL
        SELECT COALESCE(t.division_id, d.division_id, s.division_id) AS division_id, t.completed_date AS activity_date
        FROM tasks t
        LEFT JOIN dashboards d ON d.id = t.dashboard_id
        LEFT JOIN report_subscriptions s ON s.id = t.subscription_id
        WHERE t.completed_date IS NOT NULL AND t.psq_id IS NULL
      ) activity
      WHERE division_id IS NOT NULL AND activity_date IS NOT NULL
      GROUP BY division_id
    `;

    // (g) Team-wide totals.
    const totalsRows = await sql`
      SELECT
        (SELECT COUNT(*) FROM dashboards WHERE status <> 'retired') AS active_dashboards,
        (SELECT COUNT(*) FROM report_subscriptions WHERE status <> 'retired') AS active_subscriptions,
        (SELECT COUNT(*) FROM requests WHERE status = 'open') AS open_requests,
        (SELECT COUNT(*) FROM requests WHERE status = 'in_progress') AS in_progress_requests,
        (SELECT COUNT(*) FROM requests WHERE status = 'done' AND completed_date >= CURRENT_DATE - INTERVAL '90 days') AS requests_completed_recent,
        (SELECT COUNT(*) FROM tasks WHERE completed_date IS NOT NULL AND completed_date >= CURRENT_DATE - INTERVAL '90 days') AS tasks_completed_recent
    `;

    // (h) Team-wide throughput by month (requests/tasks completed per month,
    // last 6 calendar months including the current one).
    const requestThroughputRows = await sql`
      SELECT to_char(date_trunc('month', completed_date), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM requests
      WHERE completed_date IS NOT NULL
        AND completed_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1
    `;

    const taskThroughputRows = await sql`
      SELECT to_char(date_trunc('month', completed_date), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM tasks
      WHERE completed_date IS NOT NULL
        AND completed_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1
    `;

    // ---- Stitch per-division rows together by division id. ----

    type DivisionAgg = {
      activeDashboards: number;
      totalDashboards: number;
      activeSubscriptions: number;
      totalSubscriptions: number;
      openRequests: number;
      inProgressRequests: number;
      completedRequests: number;
      openTasks: number;
      completedTasks: number;
      lastActivityDate: string | null;
    };

    const aggByDivision = new Map<number, DivisionAgg>();
    const emptyAgg = (): DivisionAgg => ({
      activeDashboards: 0,
      totalDashboards: 0,
      activeSubscriptions: 0,
      totalSubscriptions: 0,
      openRequests: 0,
      inProgressRequests: 0,
      completedRequests: 0,
      openTasks: 0,
      completedTasks: 0,
      lastActivityDate: null,
    });
    const getAgg = (divisionId: number): DivisionAgg => {
      let agg = aggByDivision.get(divisionId);
      if (!agg) {
        agg = emptyAgg();
        aggByDivision.set(divisionId, agg);
      }
      return agg;
    };

    for (const row of dashboardCountRows as any[]) {
      const agg = getAgg(Number(row.division_id));
      agg.activeDashboards = Number(row.active_count);
      agg.totalDashboards = Number(row.total_count);
    }

    for (const row of subscriptionCountRows as any[]) {
      const agg = getAgg(Number(row.division_id));
      agg.activeSubscriptions = Number(row.active_count);
      agg.totalSubscriptions = Number(row.total_count);
    }

    for (const row of requestCountRows as any[]) {
      if (row.division_id === null) continue;
      const agg = getAgg(Number(row.division_id));
      agg.openRequests = Number(row.open_count);
      agg.inProgressRequests = Number(row.in_progress_count);
      agg.completedRequests = Number(row.completed_count);
    }

    for (const row of taskCountRows as any[]) {
      if (row.division_id === null) continue;
      const agg = getAgg(Number(row.division_id));
      agg.openTasks = Number(row.open_count);
      agg.completedTasks = Number(row.completed_count);
    }

    for (const row of lastActivityRows as any[]) {
      const agg = getAgg(Number(row.division_id));
      agg.lastActivityDate = row.last_activity_date;
    }

    // ---- Compute score/tier/daysSinceActivity per division in JS. ----

    const now = Date.now();

    const divisions: DivisionOverview[] = (divisionRows as any[]).map((row) => {
      const agg = aggByDivision.get(Number(row.id)) ?? emptyAgg();

      let daysSinceActivity: number | null = null;
      if (agg.lastActivityDate) {
        const activityMs = new Date(agg.lastActivityDate).getTime();
        daysSinceActivity = Math.floor((now - activityMs) / (1000 * 60 * 60 * 24));
      }

      const subscriptionsSignal = Math.min(agg.activeSubscriptions, SUBSCRIPTIONS_SIGNAL_CAP) / SUBSCRIPTIONS_SIGNAL_CAP;
      const dashboardsSignal = Math.min(agg.activeDashboards, DASHBOARDS_SIGNAL_CAP) / DASHBOARDS_SIGNAL_CAP;
      const demandSignal = Math.min(agg.openRequests + agg.inProgressRequests + agg.openTasks, DEMAND_SIGNAL_CAP) / DEMAND_SIGNAL_CAP;

      let recencySignal = 0;
      if (daysSinceActivity !== null) {
        if (daysSinceActivity <= RECENCY_RECENT_DAYS) recencySignal = 1;
        else if (daysSinceActivity <= RECENCY_WARM_DAYS) recencySignal = 0.5;
        else if (daysSinceActivity <= RECENCY_STALE_DAYS) recencySignal = 0.15;
      }

      const engagementScore = Math.round(
        (subscriptionsSignal * SUBSCRIPTIONS_WEIGHT +
          dashboardsSignal * DASHBOARDS_WEIGHT +
          demandSignal * DEMAND_WEIGHT +
          recencySignal * RECENCY_WEIGHT) *
          100
      );

      let engagementTier: EngagementTier = 'dormant';
      if (engagementScore >= ACTIVE_TIER_THRESHOLD) engagementTier = 'active';
      else if (engagementScore >= WARM_TIER_THRESHOLD) engagementTier = 'warm';

      return {
        id: Number(row.id),
        name: row.name,
        activeDashboards: agg.activeDashboards,
        totalDashboards: agg.totalDashboards,
        activeSubscriptions: agg.activeSubscriptions,
        totalSubscriptions: agg.totalSubscriptions,
        openRequests: agg.openRequests,
        inProgressRequests: agg.inProgressRequests,
        completedRequests: agg.completedRequests,
        openTasks: agg.openTasks,
        completedTasks: agg.completedTasks,
        lastActivityDate: agg.lastActivityDate,
        daysSinceActivity,
        engagementScore,
        engagementTier,
      };
    });

    divisions.sort((a, b) => b.engagementScore - a.engagementScore || a.name.localeCompare(b.name));

    // ---- Totals. ----

    const totalsRow = (totalsRows as any[])[0];
    const totals: OverviewTotals = {
      divisionsCovered: (divisionRows as any[]).length,
      activeDashboards: Number(totalsRow.active_dashboards),
      activeSubscriptions: Number(totalsRow.active_subscriptions),
      openRequests: Number(totalsRow.open_requests),
      inProgressRequests: Number(totalsRow.in_progress_requests),
      requestsCompletedRecent: Number(totalsRow.requests_completed_recent),
      tasksCompletedRecent: Number(totalsRow.tasks_completed_recent),
    };

    // ---- Throughput: last 6 calendar months (incl. current), chronological. ----

    const requestCountByMonth = new Map<string, number>(
      (requestThroughputRows as any[]).map((row) => [row.month, Number(row.count)])
    );
    const taskCountByMonth = new Map<string, number>(
      (taskThroughputRows as any[]).map((row) => [row.month, Number(row.count)])
    );

    const throughput: OverviewThroughputPoint[] = [];
    const cursor = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    cursor.setUTCMonth(cursor.getUTCMonth() - 5);
    for (let i = 0; i < 6; i++) {
      const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      throughput.push({
        month,
        requests: requestCountByMonth.get(month) ?? 0,
        tasks: taskCountByMonth.get(month) ?? 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const response: OverviewResponse = { totals, divisions, throughput };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error('Division overview error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
