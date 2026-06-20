import { sql } from './db';
import { mapDashboardRow, mapReportSubscriptionRow } from './brain-mappers';
import { Dashboard, DashboardStatus, ReportSubscription } from './brain-types';

const VALID_STATUSES: DashboardStatus[] = ['active', 'maintenance', 'retired'];

export function isValidStatus(status: string): status is DashboardStatus {
  return VALID_STATUSES.includes(status as DashboardStatus);
}

export interface ConvertEntityFields {
  name?: string;
  stakeholder?: string | null;
  status?: string;
  jiraTicketId?: string | null;
}

// Both convert* functions below run their insert/repoint/delete as a single
// SQL statement (a WITH CTE chain) rather than an array passed to
// sql.transaction([...]). The neon serverless driver's transaction() array
// form builds every tagged-template query up front before executing any of
// them, so a later element can't reference a row id an earlier element just
// inserted. A single statement sent over one HTTP round-trip is itself one
// real Postgres transaction, and a CTE lets the INSERT's RETURNING id feed
// directly into the UPDATE/DELETE that follow it in the same statement —
// which is exactly the "read the row I just inserted" dependency this
// conversion needs, with no separate result-shuttling required.

/**
 * Converts a dashboard into a report subscription: inserts a new
 * report_subscriptions row (copying the dashboard's fields, with `fields`
 * overriding where provided), repoints every requests row that referenced
 * the dashboard onto the new subscription, and deletes the original
 * dashboard row. Returns the new subscription, or null if no dashboard with
 * `dashboardId` exists.
 */
export async function convertDashboardToSubscription(
  dashboardId: number,
  fields: ConvertEntityFields
): Promise<ReportSubscription | null> {
  const current = await sql`
    SELECT name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    FROM dashboards
    WHERE id = ${dashboardId}
  `;

  if (current.length === 0) {
    return null;
  }

  // last_touched_date and created_date are carried over verbatim from the
  // original row, not reset to today: converting an entity's kind is a
  // metadata correction, not "this was worked on" (which would distort the
  // staleness/urgency scoring), and not a new entity (which would lose its
  // real creation history).
  const merged = {
    name: fields.name !== undefined ? fields.name : current[0].name,
    stakeholder: fields.stakeholder !== undefined ? fields.stakeholder : current[0].stakeholder,
    status: fields.status !== undefined ? fields.status : current[0].status,
    jiraTicketId: fields.jiraTicketId !== undefined ? fields.jiraTicketId : current[0].jira_ticket_id,
  };

  const rows = await sql`
    WITH ins AS (
      INSERT INTO report_subscriptions (name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date)
      SELECT ${merged.name}, division_id, analyst_id, ${merged.stakeholder}, ${merged.status}, ${merged.jiraTicketId}, last_touched_date, created_date
      FROM dashboards
      WHERE id = ${dashboardId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    ),
    repoint AS (
      UPDATE requests
      SET dashboard_id = NULL, subscription_id = (SELECT id FROM ins)
      WHERE dashboard_id = ${dashboardId}
      RETURNING id
    ),
    -- del's WHERE clause references repoint's row count so Postgres is forced
    -- to materialize repoint before del runs. Without this dependency the two
    -- CTEs have no defined execution order, and del running first would
    -- ON DELETE CASCADE away the very requests rows repoint exists to save.
    del AS (
      DELETE FROM dashboards
      WHERE id = ${dashboardId} AND (SELECT count(*) FROM repoint) >= 0
    )
    SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    FROM ins
  `;

  // rows can be empty if the dashboard was deleted by something else in the
  // window between the existence check above and this statement (TOCTOU) —
  // the ins CTE's source SELECT then matches no rows, so it's a legal
  // zero-row insert rather than an error. Treat that the same as "never
  // existed" instead of indexing into an empty array and throwing.
  if (rows.length === 0) {
    return null;
  }

  return mapReportSubscriptionRow(rows[0]);
}

/**
 * Converts a report subscription into a dashboard: mirrors
 * convertDashboardToSubscription in the opposite direction. Returns the new
 * dashboard, or null if no subscription with `subscriptionId` exists.
 */
export async function convertSubscriptionToDashboard(
  subscriptionId: number,
  fields: ConvertEntityFields
): Promise<Dashboard | null> {
  const current = await sql`
    SELECT name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    FROM report_subscriptions
    WHERE id = ${subscriptionId}
  `;

  if (current.length === 0) {
    return null;
  }

  // last_touched_date and created_date are carried over verbatim — see the
  // comment in convertDashboardToSubscription above for why.
  const merged = {
    name: fields.name !== undefined ? fields.name : current[0].name,
    stakeholder: fields.stakeholder !== undefined ? fields.stakeholder : current[0].stakeholder,
    status: fields.status !== undefined ? fields.status : current[0].status,
    jiraTicketId: fields.jiraTicketId !== undefined ? fields.jiraTicketId : current[0].jira_ticket_id,
  };

  const rows = await sql`
    WITH ins AS (
      INSERT INTO dashboards (name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date)
      SELECT ${merged.name}, division_id, analyst_id, ${merged.stakeholder}, ${merged.status}, ${merged.jiraTicketId}, last_touched_date, created_date
      FROM report_subscriptions
      WHERE id = ${subscriptionId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    ),
    repoint AS (
      UPDATE requests
      SET subscription_id = NULL, dashboard_id = (SELECT id FROM ins)
      WHERE subscription_id = ${subscriptionId}
      RETURNING id
    ),
    -- del's WHERE clause references repoint's row count so Postgres is forced
    -- to materialize repoint before del runs. Without this dependency the two
    -- CTEs have no defined execution order, and del running first would
    -- ON DELETE CASCADE away the very requests rows repoint exists to save.
    del AS (
      DELETE FROM report_subscriptions
      WHERE id = ${subscriptionId} AND (SELECT count(*) FROM repoint) >= 0
    )
    SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    FROM ins
  `;

  // See the matching comment in convertDashboardToSubscription above: rows
  // can be empty under the same TOCTOU race, and that must map to null, not
  // a thrown TypeError from indexing an empty array.
  if (rows.length === 0) {
    return null;
  }

  return mapDashboardRow(rows[0]);
}
