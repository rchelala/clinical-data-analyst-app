import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapIntakeRequestRow } from '@/lib/brain-mappers';
import { IntakePriority, IntakeStatus, BrainEntityKind } from '@/lib/brain-types';

const VALID_PRIORITIES: IntakePriority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: IntakeStatus[] = ['not_started', 'discovery', 'ready', 'in_progress', 'on_hold', 'fulfilled'];
const VALID_REQUESTED_KINDS: BrainEntityKind[] = ['dashboard', 'subscription'];

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
    const intakeRequestId = Number(id);
    if (!Number.isFinite(intakeRequestId)) {
      return NextResponse.json({ error: 'Invalid intake request id.' }, { status: 400 });
    }

    const body = await req.json() as {
      priority?: string;
      divisionId?: number | null;
      stakeholder?: string | null;
      analystId?: number | null;
      requestedKind?: string | null;
      status?: string;
      ticketLink?: string | null;
      internalComments?: string | null;
    };
    const { priority, divisionId, analystId, requestedKind, status } = body;
    const stakeholder = normalizeNullableString(body.stakeholder);
    const ticketLink = normalizeNullableString(body.ticketLink);
    const internalComments = normalizeNullableString(body.internalComments);

    if (
      priority === undefined &&
      divisionId === undefined &&
      stakeholder === undefined &&
      analystId === undefined &&
      requestedKind === undefined &&
      status === undefined &&
      ticketLink === undefined &&
      internalComments === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as IntakePriority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (status !== undefined && !VALID_STATUSES.includes(status as IntakeStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if (
      requestedKind !== undefined &&
      requestedKind !== null &&
      !VALID_REQUESTED_KINDS.includes(requestedKind as BrainEntityKind)
    ) {
      return NextResponse.json(
        { error: `requestedKind must be one of: ${VALID_REQUESTED_KINDS.join(', ')}` },
        { status: 400 }
      );
    }

    const current = await sql`
      SELECT id, priority, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments
      FROM intake_requests
      WHERE id = ${intakeRequestId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Intake request not found.' }, { status: 404 });
    }

    // No optimistic lock on this fetch-merge-write; acceptable for
    // single-admin use where concurrent edits to the same row are not expected.
    const merged = {
      priority: priority !== undefined ? priority : current[0].priority,
      divisionId: divisionId !== undefined ? divisionId : current[0].division_id,
      stakeholder: stakeholder !== undefined ? stakeholder : current[0].stakeholder,
      analystId: analystId !== undefined ? analystId : current[0].analyst_id,
      requestedKind: requestedKind !== undefined ? requestedKind : current[0].requested_kind,
      status: status !== undefined ? status : current[0].status,
      ticketLink: ticketLink !== undefined ? ticketLink : current[0].ticket_link,
      internalComments: internalComments !== undefined ? internalComments : current[0].internal_comments,
    };

    const rows = await sql`
      UPDATE intake_requests
      SET priority = ${merged.priority}, division_id = ${merged.divisionId}, stakeholder = ${merged.stakeholder}, analyst_id = ${merged.analystId}, requested_kind = ${merged.requestedKind}, status = ${merged.status}, ticket_link = ${merged.ticketLink}, internal_comments = ${merged.internalComments}
      WHERE id = ${intakeRequestId}
      RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
    `;

    return NextResponse.json(mapIntakeRequestRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update intake request error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist.' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const intakeRequestId = Number(id);
    if (!Number.isFinite(intakeRequestId)) {
      return NextResponse.json({ error: 'Invalid intake request id.' }, { status: 400 });
    }

    const rows = await sql`
      DELETE FROM intake_requests
      WHERE id = ${intakeRequestId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Intake request not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: intakeRequestId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete intake request error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
