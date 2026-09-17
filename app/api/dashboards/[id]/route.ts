import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDashboardRow } from '@/lib/brain-mappers';
import { DashboardStatus, UrgencyBucket } from '@/lib/brain-types';
import { normalizeNullableString } from '@/lib/normalize';

const VALID_STATUSES: DashboardStatus[] = ['active', 'maintenance', 'retired'];
const VALID_URGENCY: UrgencyBucket[] = ['high', 'med', 'low'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dashboardId = Number(id);
    if (!Number.isInteger(dashboardId)) {
      return NextResponse.json({ error: 'Invalid dashboard id.' }, { status: 400 });
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
      analystId?: number | null;
      manualUrgency?: UrgencyBucket | null;
    };
    const { name, status, divisionId, analystId } = body;
    const manualUrgency = body.manualUrgency;
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
      analystId === undefined &&
      manualUrgency === undefined
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

    if (
      manualUrgency !== undefined &&
      manualUrgency !== null &&
      !VALID_URGENCY.includes(manualUrgency)
    ) {
      return NextResponse.json(
        { error: `manualUrgency must be one of: ${VALID_URGENCY.join(', ')}, or null` },
        { status: 400 }
      );
    }

    // Single UPDATE that only touches columns actually present in the body
    // (via a CASE per column keyed on a "was this field provided" flag) —
    // no read-merge-write, so a concurrent PATCH to a *different* field on
    // the same dashboard can't clobber this one's change. name is trimmed
    // before the "has" flag is computed so an explicitly-provided value
    // always wins even when unchanged.
    const trimmedName = name !== undefined ? name.trim() : undefined;
    const hasName = trimmedName !== undefined;
    const hasStakeholder = stakeholder !== undefined;
    const hasStatus = status !== undefined;
    const hasJiraTicketId = jiraTicketId !== undefined;
    const hasPriority = priority !== undefined;
    const hasEnterpriseAnalyst = enterpriseAnalyst !== undefined;
    const hasComments = comments !== undefined;
    const hasNotes = notes !== undefined;
    const hasWorklistStatus = worklistStatus !== undefined;
    const hasSummary = summary !== undefined;
    const hasDivisionId = divisionId !== undefined;
    const hasAnalystId = analystId !== undefined;
    const hasManualUrgency = manualUrgency !== undefined;

    // last_touched_date intentionally untouched here: it drives the
    // staleness/urgency scoring, and a metadata correction (renaming,
    // fixing a stakeholder, etc.) isn't "this dashboard was worked on" —
    // bumping it would artificially suppress the urgency signal.
    const rows = await sql`
      UPDATE dashboards
      SET
        name = CASE WHEN ${hasName} THEN ${trimmedName ?? null}::text ELSE name END,
        stakeholder = CASE WHEN ${hasStakeholder} THEN ${stakeholder ?? null}::text ELSE stakeholder END,
        status = CASE WHEN ${hasStatus} THEN ${status ?? null}::text ELSE status END,
        jira_ticket_id = CASE WHEN ${hasJiraTicketId} THEN ${jiraTicketId ?? null}::text ELSE jira_ticket_id END,
        priority = CASE WHEN ${hasPriority} THEN ${priority ?? null}::text ELSE priority END,
        enterprise_analyst = CASE WHEN ${hasEnterpriseAnalyst} THEN ${enterpriseAnalyst ?? null}::text ELSE enterprise_analyst END,
        comments = CASE WHEN ${hasComments} THEN ${comments ?? null}::text ELSE comments END,
        notes = CASE WHEN ${hasNotes} THEN ${notes ?? null}::text ELSE notes END,
        worklist_status = CASE WHEN ${hasWorklistStatus} THEN ${worklistStatus ?? null}::text ELSE worklist_status END,
        summary = CASE WHEN ${hasSummary} THEN ${summary ?? null}::text ELSE summary END,
        division_id = CASE WHEN ${hasDivisionId} THEN ${divisionId ?? null}::int ELSE division_id END,
        analyst_id = CASE WHEN ${hasAnalystId} THEN ${analystId ?? null}::int ELSE analyst_id END,
        manual_urgency = CASE WHEN ${hasManualUrgency} THEN ${manualUrgency ?? null}::text ELSE manual_urgency END
      WHERE id = ${dashboardId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date,
                priority, enterprise_analyst, comments, notes, worklist_status, summary, manual_urgency
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Dashboard not found.' }, { status: 404 });
    }

    return NextResponse.json(mapDashboardRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update dashboard error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId or analystId does not exist.' },
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
    const dashboardId = Number(id);
    if (!Number.isInteger(dashboardId)) {
      return NextResponse.json({ error: 'Invalid dashboard id.' }, { status: 400 });
    }

    // requests.dashboard_id has ON DELETE CASCADE (see scripts/schema.sql),
    // so deleting the dashboard automatically deletes its requests. Dashboards
    // have no attachments of their own, so no blob cleanup is needed here.
    const rows = await sql`
      DELETE FROM dashboards
      WHERE id = ${dashboardId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Dashboard not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: dashboardId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete dashboard error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
