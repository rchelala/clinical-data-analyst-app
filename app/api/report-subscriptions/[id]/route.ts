import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapReportSubscriptionRow } from '@/lib/brain-mappers';
import { DashboardStatus } from '@/lib/brain-types';

const VALID_STATUSES: DashboardStatus[] = ['active', 'maintenance', 'retired'];

// Trims a provided string field to null when empty, matching the
// null-vs-empty-string normalization EditEntityForm already applies
// client-side. `undefined` (not provided) and `null` (explicit clear)
// pass through unchanged.
function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subscriptionId = Number(id);
    if (!Number.isFinite(subscriptionId)) {
      return NextResponse.json({ error: 'Invalid report subscription id.' }, { status: 400 });
    }

    const body = await req.json() as {
      name?: string;
      stakeholder?: string | null;
      status?: string;
      jiraTicketId?: string | null;
      priority?: string | null;
      enterpriseAnalyst?: string | null;
      comments?: string | null;
      notes?: string | null;
      worklistStatus?: string | null;
      summary?: string | null;
      divisionId?: number;
      linkedDashboardId?: number | null;
    };
    const { name, status, divisionId, linkedDashboardId } = body;
    const stakeholder = normalizeNullableString(body.stakeholder);
    const jiraTicketId = normalizeNullableString(body.jiraTicketId);
    const priority = normalizeNullableString(body.priority);
    const enterpriseAnalyst = normalizeNullableString(body.enterpriseAnalyst);
    const comments = normalizeNullableString(body.comments);
    const notes = normalizeNullableString(body.notes);
    const worklistStatus = normalizeNullableString(body.worklistStatus);
    const summary = normalizeNullableString(body.summary);

    if (
      name === undefined &&
      stakeholder === undefined &&
      status === undefined &&
      jiraTicketId === undefined &&
      priority === undefined &&
      enterpriseAnalyst === undefined &&
      comments === undefined &&
      notes === undefined &&
      worklistStatus === undefined &&
      summary === undefined &&
      divisionId === undefined &&
      linkedDashboardId === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    }

    if (status !== undefined && !VALID_STATUSES.includes(status as DashboardStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const current = await sql`
      SELECT id, name, division_id, stakeholder, status, jira_ticket_id, linked_dashboard_id, priority, enterprise_analyst, comments, notes, worklist_status, summary
      FROM report_subscriptions
      WHERE id = ${subscriptionId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Report subscription not found.' }, { status: 404 });
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
      const effectiveDivisionId = divisionId !== undefined ? divisionId : current[0].division_id;
      if (linkedDashboardRows[0].division_id !== effectiveDivisionId) {
        return NextResponse.json(
          { error: 'linkedDashboardId must be a dashboard in the same division.' },
          { status: 400 }
        );
      }
    }

    // No optimistic lock on this fetch-merge-write; acceptable for
    // single-admin use where concurrent edits to the same row are not expected.
    const merged = {
      name: name !== undefined ? name.trim() : current[0].name,
      stakeholder: stakeholder !== undefined ? stakeholder : current[0].stakeholder,
      status: status !== undefined ? status : current[0].status,
      jiraTicketId: jiraTicketId !== undefined ? jiraTicketId : current[0].jira_ticket_id,
      priority: priority !== undefined ? priority : current[0].priority,
      enterpriseAnalyst: enterpriseAnalyst !== undefined ? enterpriseAnalyst : current[0].enterprise_analyst,
      comments: comments !== undefined ? comments : current[0].comments,
      notes: notes !== undefined ? notes : current[0].notes,
      worklistStatus: worklistStatus !== undefined ? worklistStatus : current[0].worklist_status,
      summary: summary !== undefined ? summary : current[0].summary,
      divisionId: divisionId !== undefined ? divisionId : current[0].division_id,
      linkedDashboardId: linkedDashboardId !== undefined ? linkedDashboardId : current[0].linked_dashboard_id,
    };

    // last_touched_date intentionally untouched here: it drives the
    // staleness/urgency scoring, and a metadata correction (renaming,
    // fixing a stakeholder, etc.) isn't "this subscription was worked on" —
    // bumping it would artificially suppress the urgency signal.
    const rows = await sql`
      UPDATE report_subscriptions
      SET name = ${merged.name}, stakeholder = ${merged.stakeholder}, status = ${merged.status}, jira_ticket_id = ${merged.jiraTicketId},
          priority = ${merged.priority}, enterprise_analyst = ${merged.enterpriseAnalyst}, comments = ${merged.comments},
          notes = ${merged.notes}, worklist_status = ${merged.worklistStatus}, summary = ${merged.summary},
          division_id = ${merged.divisionId}, linked_dashboard_id = ${merged.linkedDashboardId}
      WHERE id = ${subscriptionId}
      RETURNING id, name, division_id, analyst_id, linked_dashboard_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date,
                priority, enterprise_analyst, comments, notes, worklist_status, summary
    `;

    return NextResponse.json(mapReportSubscriptionRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update report subscription error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId does not exist.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subscriptionId = Number(id);
    if (!Number.isFinite(subscriptionId)) {
      return NextResponse.json({ error: 'Invalid report subscription id.' }, { status: 400 });
    }

    // requests.subscription_id has ON DELETE CASCADE (see scripts/schema.sql),
    // so deleting the subscription automatically deletes its requests.
    // Subscriptions have no attachments of their own, so no blob cleanup is
    // needed here.
    const rows = await sql`
      DELETE FROM report_subscriptions
      WHERE id = ${subscriptionId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Report subscription not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: subscriptionId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete report subscription error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
