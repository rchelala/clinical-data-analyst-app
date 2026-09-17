import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapIntakeRequestRow } from '@/lib/brain-mappers';
import { IntakePriority, IntakeStatus, BrainEntityKind } from '@/lib/brain-types';
import { normalizeNullableString } from '@/lib/normalize';

const VALID_PRIORITIES: IntakePriority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: IntakeStatus[] = ['not_started', 'discovery', 'ready', 'in_progress', 'on_hold', 'fulfilled'];
const VALID_REQUESTED_KINDS: BrainEntityKind[] = ['dashboard', 'subscription'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const intakeRequestId = Number(id);
    if (!Number.isInteger(intakeRequestId)) {
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

    // 'fulfilled' must only be set via POST .../convert, which also sets
    // fulfilled_entity_kind/fulfilled_entity_id together. Allowing it here
    // would let a row display as fulfilled without ever having gone
    // through a real conversion.
    if (status === 'fulfilled') {
      return NextResponse.json(
        { error: "status cannot be set to 'fulfilled' via PATCH; use the convert endpoint instead." },
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

    // Single UPDATE that only touches columns actually present in the body
    // (via a CASE per column keyed on a "was this field provided" flag) —
    // no read-merge-write, so a concurrent PATCH to a *different* field on
    // the same intake request can't clobber this one's change. 404 comes
    // from UPDATE...RETURNING finding no matching row.
    const hasPriority = priority !== undefined;
    const hasDivisionId = divisionId !== undefined;
    const hasStakeholder = stakeholder !== undefined;
    const hasAnalystId = analystId !== undefined;
    const hasRequestedKind = requestedKind !== undefined;
    const hasStatus = status !== undefined;
    const hasTicketLink = ticketLink !== undefined;
    const hasInternalComments = internalComments !== undefined;

    const rows = await sql`
      UPDATE intake_requests
      SET
        priority = CASE WHEN ${hasPriority} THEN ${priority ?? null}::text ELSE priority END,
        division_id = CASE WHEN ${hasDivisionId} THEN ${divisionId ?? null}::int ELSE division_id END,
        stakeholder = CASE WHEN ${hasStakeholder} THEN ${stakeholder ?? null}::text ELSE stakeholder END,
        analyst_id = CASE WHEN ${hasAnalystId} THEN ${analystId ?? null}::int ELSE analyst_id END,
        requested_kind = CASE WHEN ${hasRequestedKind} THEN ${requestedKind ?? null}::text ELSE requested_kind END,
        status = CASE WHEN ${hasStatus} THEN ${status ?? null}::text ELSE status END,
        ticket_link = CASE WHEN ${hasTicketLink} THEN ${ticketLink ?? null}::text ELSE ticket_link END,
        internal_comments = CASE WHEN ${hasInternalComments} THEN ${internalComments ?? null}::text ELSE internal_comments END
      WHERE id = ${intakeRequestId}
      RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Intake request not found.' }, { status: 404 });
    }

    return NextResponse.json(mapIntakeRequestRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update intake request error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist.' },
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
    const intakeRequestId = Number(id);
    if (!Number.isInteger(intakeRequestId)) {
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
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
