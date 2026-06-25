import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapIntakeRequestRow, mapIntakeRequestWithNamesRow } from '@/lib/brain-mappers';
import { IntakePriority, IntakeStatus, BrainEntityKind } from '@/lib/brain-types';

const VALID_PRIORITIES: IntakePriority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: IntakeStatus[] = ['not_started', 'discovery', 'ready', 'in_progress', 'on_hold', 'fulfilled'];
const VALID_REQUESTED_KINDS: BrainEntityKind[] = ['dashboard', 'subscription'];

export async function GET(req: NextRequest) {
  try {
    const statusParam = req.nextUrl.searchParams.get('status');

    if (statusParam !== null && !VALID_STATUSES.includes(statusParam as IntakeStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Default view hides fulfilled requests; an explicit ?status= filters to
    // exactly that status (including 'fulfilled' itself, if requested).
    const rows = statusParam !== null
      ? await sql`
          SELECT
            i.id, i.priority, i.date_received, i.division_id, i.topic, i.stakeholder,
            i.analyst_id, i.requested_kind, i.status, i.ticket_link, i.internal_comments,
            i.created_date, i.fulfilled_entity_kind, i.fulfilled_entity_id,
            d.name AS division_name, a.name AS analyst_name
          FROM intake_requests i
          LEFT JOIN divisions d ON d.id = i.division_id
          LEFT JOIN analysts a ON a.id = i.analyst_id
          WHERE i.status = ${statusParam}
          ORDER BY i.date_received DESC
        `
      : await sql`
          SELECT
            i.id, i.priority, i.date_received, i.division_id, i.topic, i.stakeholder,
            i.analyst_id, i.requested_kind, i.status, i.ticket_link, i.internal_comments,
            i.created_date, i.fulfilled_entity_kind, i.fulfilled_entity_id,
            d.name AS division_name, a.name AS analyst_name
          FROM intake_requests i
          LEFT JOIN divisions d ON d.id = i.division_id
          LEFT JOIN analysts a ON a.id = i.analyst_id
          WHERE i.status != 'fulfilled'
          ORDER BY i.date_received DESC
        `;

    return NextResponse.json(rows.map(mapIntakeRequestWithNamesRow));
  } catch (err: unknown) {
    console.error('List intake requests error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      topic?: string;
      priority?: string;
      divisionId?: number;
      stakeholder?: string;
      analystId?: number;
      requestedKind?: string;
      ticketLink?: string;
      internalComments?: string;
    };

    const {
      topic,
      priority,
      divisionId,
      stakeholder,
      analystId,
      requestedKind,
      ticketLink,
      internalComments,
    } = body;

    if (!topic?.trim()) {
      return NextResponse.json({ error: 'topic is required.' }, { status: 400 });
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as IntakePriority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (requestedKind !== undefined && !VALID_REQUESTED_KINDS.includes(requestedKind as BrainEntityKind)) {
      return NextResponse.json(
        { error: `requestedKind must be one of: ${VALID_REQUESTED_KINDS.join(', ')}` },
        { status: 400 }
      );
    }

    // status/dateReceived/createdDate use DB defaults; fulfilledEntityKind/
    // fulfilledEntityId are reserved for the convert endpoint and are never
    // accepted here, even if present in the body, to avoid creating a row
    // that claims to be fulfilled without going through that flow.
    const rows = await sql`
      INSERT INTO intake_requests (priority, division_id, topic, stakeholder, analyst_id, requested_kind, ticket_link, internal_comments)
      VALUES (${priority ?? 'low'}, ${divisionId ?? null}, ${topic.trim()}, ${stakeholder ?? null}, ${analystId ?? null}, ${requestedKind ?? null}, ${ticketLink ?? null}, ${internalComments ?? null})
      RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
    `;

    return NextResponse.json(mapIntakeRequestRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create intake request error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/analystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
