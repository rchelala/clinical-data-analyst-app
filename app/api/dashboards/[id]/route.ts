import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDashboardRow } from '@/lib/brain-mappers';
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
    const dashboardId = Number(id);
    if (!Number.isFinite(dashboardId)) {
      return NextResponse.json({ error: 'Invalid dashboard id.' }, { status: 400 });
    }

    const body = await req.json() as {
      name?: string;
      stakeholder?: string | null;
      status?: string;
      jiraTicketId?: string | null;
      divisionId?: number;
    };
    const { name, status, divisionId } = body;
    const stakeholder = normalizeNullableString(body.stakeholder);
    const jiraTicketId = normalizeNullableString(body.jiraTicketId);

    if (
      name === undefined &&
      stakeholder === undefined &&
      status === undefined &&
      jiraTicketId === undefined &&
      divisionId === undefined
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
      SELECT id, name, division_id, stakeholder, status, jira_ticket_id
      FROM dashboards
      WHERE id = ${dashboardId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Dashboard not found.' }, { status: 404 });
    }

    // No optimistic lock on this fetch-merge-write; acceptable for
    // single-admin use where concurrent edits to the same row are not expected.
    const merged = {
      name: name !== undefined ? name.trim() : current[0].name,
      stakeholder: stakeholder !== undefined ? stakeholder : current[0].stakeholder,
      status: status !== undefined ? status : current[0].status,
      jiraTicketId: jiraTicketId !== undefined ? jiraTicketId : current[0].jira_ticket_id,
      divisionId: divisionId !== undefined ? divisionId : current[0].division_id,
    };

    // last_touched_date intentionally untouched here: it drives the
    // staleness/urgency scoring, and a metadata correction (renaming,
    // fixing a stakeholder, etc.) isn't "this dashboard was worked on" —
    // bumping it would artificially suppress the urgency signal.
    const rows = await sql`
      UPDATE dashboards
      SET name = ${merged.name}, stakeholder = ${merged.stakeholder}, status = ${merged.status}, jira_ticket_id = ${merged.jiraTicketId}, division_id = ${merged.divisionId}
      WHERE id = ${dashboardId}
      RETURNING id, name, division_id, analyst_id, stakeholder, status, jira_ticket_id, last_touched_date, created_date
    `;

    return NextResponse.json(mapDashboardRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update dashboard error:', err);
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
    const dashboardId = Number(id);
    if (!Number.isFinite(dashboardId)) {
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
