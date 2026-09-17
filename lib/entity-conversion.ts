import { sql } from './db';
import { mapDashboardRow, mapReportSubscriptionRow } from './brain-mappers';
import { Dashboard, DashboardStatus, ReportSubscription } from './brain-types';

export const VALID_STATUSES: DashboardStatus[] = ['active', 'maintenance', 'retired'];

export function isValidStatus(status: string): status is DashboardStatus {
  return VALID_STATUSES.includes(status as DashboardStatus);
}

export interface ConvertEntityFields {
  name?: string;
  stakeholder?: string | null;
  status?: string;
  jiraTicketId?: string | null;
}

// Note: report_subscriptions.linked_dashboard_id is intentionally NOT
// carried over by either conversion direction. Converting a subscription
// into a dashboard drops its outgoing link (dashboards can't link to other
// dashboards, so there's nothing to carry it to); converting a dashboard
// into a subscription deletes the dashboard row, which already triggers
// `ON DELETE SET NULL` on any other subscriptions that were linked to it —
// the link can be re-set afterward by editing the resulting subscription.

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
//
// Besides `requests`, two other tables reference dashboards/report_subscriptions
// and need explicit handling so the original row's DELETE doesn't destroy
// data that should survive the conversion: `tasks` (dashboard_id/subscription_id
// has ON DELETE CASCADE, so it would otherwise CASCADE-delete every task on
// the entity) and `intake_requests` (fulfilled_entity_kind/fulfilled_entity_id
// is a soft pointer with no FK at all, so it would otherwise silently dangle,
// pointing at an id that no longer exists). Each conversion repoints both.
// Two other references are intentionally NOT repointed and are left to their
// existing DB behavior: `psqs.dashboard_id` has ON DELETE SET NULL, and
// dashboard→subscription conversion drops any `worklist_dashboards` rows for
// non-owner ("covering") analysts, since subscriptions have no equivalent
// membership table — only the owner's worklist membership is re-created (see
// the ins_worklist CTE in convertSubscriptionToDashboard).

/**
 * Converts a dashboard into a report subscription: inserts a new
 * report_subscriptions row (copying the dashboard's fields, with `fields`
 * overriding where provided), repoints every requests, tasks, and
 * intake_requests row that referenced the dashboard onto the new
 * subscription, and deletes the original dashboard row. Returns the new
 * subscription, or null if no dashboard with `dashboardId` exists.
 *
 * Not carried over: `worklist_dashboards` rows for analysts other than the
 * owner (covering analysts who added the dashboard to their own worklist) —
 * subscriptions have no equivalent membership table, so those rows are
 * dropped by ON DELETE CASCADE when the dashboard row is deleted. Any
 * `psqs.dashboard_id` pointing at the dashboard is cleared to NULL by its
 * existing ON DELETE SET NULL.
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
      INSERT INTO report_subscriptions (name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency)
      SELECT ${merged.name}, division_id, analyst_id, ${merged.stakeholder}, ${merged.status}, ${merged.jiraTicketId}, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
      FROM dashboards
      WHERE id = ${dashboardId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
    ),
    repoint AS (
      UPDATE requests
      SET dashboard_id = NULL, subscription_id = (SELECT id FROM ins)
      WHERE dashboard_id = ${dashboardId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- Without this, tasks.dashboard_id's ON DELETE CASCADE would silently
    -- delete every task on the dashboard when del below runs.
    repoint_tasks AS (
      UPDATE tasks
      SET dashboard_id = NULL, subscription_id = (SELECT id FROM ins)
      WHERE dashboard_id = ${dashboardId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- intake_requests.fulfilled_entity_id is a soft pointer (no FK), so it
    -- wouldn't be touched by the DELETE at all if left unrepointed here —
    -- it would just dangle, pointing at a dashboard id that no longer exists.
    -- The EXISTS guard matters here specifically: without it, if the source
    -- dashboard already vanished (ins returns 0 rows, the TOCTOU race
    -- described below), this would still fire and rewrite matching
    -- intake_requests rows to point at a NULL id.
    repoint_intake AS (
      UPDATE intake_requests
      SET fulfilled_entity_kind = 'subscription', fulfilled_entity_id = (SELECT id FROM ins)
      WHERE fulfilled_entity_kind = 'dashboard' AND fulfilled_entity_id = ${dashboardId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- del's WHERE clause references every repoint CTE's row count. FK cascade
    -- triggers fire at end-of-statement, after all CTEs have run, and only
    -- act on rows that still match the FK at that point — so this isn't
    -- about racing the cascade itself. It's about CTEs having no defined
    -- execution order otherwise: without the count dependency, Postgres
    -- could run del before the repoint CTEs, and the CASCADE fired by del
    -- would then delete the very requests/tasks rows repoint/repoint_tasks
    -- exist to save before they get a chance to move them off the entity.
    del AS (
      DELETE FROM dashboards
      WHERE id = ${dashboardId}
        AND (SELECT count(*) FROM repoint) + (SELECT count(*) FROM repoint_tasks) + (SELECT count(*) FROM repoint_intake) >= 0
    )
    SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
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
 * convertDashboardToSubscription in the opposite direction, also repointing
 * tasks and intake_requests, plus (since dashboards, unlike subscriptions,
 * appear on a worklist via `worklist_dashboards` membership rather than
 * ownership alone) re-adding the new dashboard to its owner's worklist so it
 * doesn't disappear from where the subscription used to show. Returns the
 * new dashboard, or null if no subscription with `subscriptionId` exists.
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
      INSERT INTO dashboards (name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency)
      SELECT ${merged.name}, division_id, analyst_id, ${merged.stakeholder}, ${merged.status}, ${merged.jiraTicketId}, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
      FROM report_subscriptions
      WHERE id = ${subscriptionId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
    ),
    repoint AS (
      UPDATE requests
      SET subscription_id = NULL, dashboard_id = (SELECT id FROM ins)
      WHERE subscription_id = ${subscriptionId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- Without this, tasks.subscription_id's ON DELETE CASCADE would silently
    -- delete every task on the subscription when del below runs.
    repoint_tasks AS (
      UPDATE tasks
      SET subscription_id = NULL, dashboard_id = (SELECT id FROM ins)
      WHERE subscription_id = ${subscriptionId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- intake_requests.fulfilled_entity_id is a soft pointer (no FK), so it
    -- wouldn't be touched by the DELETE at all if left unrepointed here —
    -- it would just dangle, pointing at a subscription id that no longer
    -- exists. The EXISTS guard matters here specifically: without it, if the
    -- source subscription already vanished (ins returns 0 rows, the TOCTOU
    -- race described below), this would still fire and rewrite matching
    -- intake_requests rows to point at a NULL id.
    repoint_intake AS (
      UPDATE intake_requests
      SET fulfilled_entity_kind = 'dashboard', fulfilled_entity_id = (SELECT id FROM ins)
      WHERE fulfilled_entity_kind = 'subscription' AND fulfilled_entity_id = ${subscriptionId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    -- Subscriptions appear on the owner's worklist purely via
    -- report_subscriptions.analyst_id (no membership table); dashboards
    -- appear via worklist_dashboards rows instead. Re-add the new dashboard
    -- to its owner's worklist so it doesn't vanish from where the
    -- subscription used to show. ON CONFLICT DO NOTHING is purely defensive
    -- here — ins.id is a freshly minted serial id, so a real unique-key
    -- conflict on (analyst_id, dashboard_id) can't actually happen; it just
    -- guards against this INSERT ever being duplicated by a future change.
    ins_worklist AS (
      INSERT INTO worklist_dashboards (analyst_id, dashboard_id)
      SELECT analyst_id, id FROM ins WHERE analyst_id IS NOT NULL
      ON CONFLICT DO NOTHING
    ),
    -- del's WHERE clause references every repoint CTE's row count. FK cascade
    -- triggers fire at end-of-statement, after all CTEs have run, and only
    -- act on rows that still match the FK at that point — so this isn't
    -- about racing the cascade itself. It's about CTEs having no defined
    -- execution order otherwise: without the count dependency, Postgres
    -- could run del before the repoint CTEs, and the CASCADE fired by del
    -- would then delete the very requests/tasks rows repoint/repoint_tasks
    -- exist to save before they get a chance to move them off the entity.
    del AS (
      DELETE FROM report_subscriptions
      WHERE id = ${subscriptionId}
        AND (SELECT count(*) FROM repoint) + (SELECT count(*) FROM repoint_tasks) + (SELECT count(*) FROM repoint_intake) >= 0
    )
    SELECT id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date, priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
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
