import { sql } from '@/lib/db';

// Shared raw-row queries for dashboards and report subscriptions, used by
// app/api/dashboards/route.ts, app/api/report-subscriptions/route.ts, and
// app/api/brain/galaxy/route.ts. Each returns the same set of urgency-driving
// fields (`days_stale`, `open_request_count`, `oldest_open_request_age_days`)
// alongside the entity's own columns, optionally scoped to one analyst.
// Urgency computation and response shaping stay in the calling routes.

// Aggregates open-request stats per dashboard in one round trip, then joins
// onto dashboards, so callers avoid N+1 queries. `days_stale` and
// `oldest_open_request_age_days` are computed in SQL as integer day diffs.
export async function fetchDashboardRowsWithStaleness(analystId?: number) {
  return analystId
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
          d.priority,
          d.enterprise_analyst,
          d.comments,
          d.notes,
          d.worklist_status,
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
          d.priority,
          d.enterprise_analyst,
          d.comments,
          d.notes,
          d.worklist_status,
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
}

// Aggregates open-request stats per subscription in one round trip, then
// joins onto report_subscriptions, so callers avoid N+1 queries. `days_stale`
// and `oldest_open_request_age_days` are computed in SQL as integer day diffs.
export async function fetchSubscriptionRowsWithStaleness(analystId?: number) {
  return analystId
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
          s.priority,
          s.enterprise_analyst,
          s.comments,
          s.notes,
          s.worklist_status,
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
          s.priority,
          s.enterprise_analyst,
          s.comments,
          s.notes,
          s.worklist_status,
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
}
