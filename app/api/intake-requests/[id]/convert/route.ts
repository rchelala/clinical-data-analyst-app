import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapIntakeRequestRow } from '@/lib/brain-mappers';
import { BrainEntityKind } from '@/lib/brain-types';

const VALID_KINDS: BrainEntityKind[] = ['dashboard', 'subscription'];

// Marks an intake request as fulfilled by a dashboard/subscription that the
// client has *already created* via POST /api/dashboards or
// POST /api/report-subscriptions. This endpoint does not create anything
// itself — it only records the soft pointer (fulfilled_entity_kind/
// fulfilled_entity_id are not a real FK; see scripts/migrations/007_intake_requests.sql).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const intakeRequestId = Number(id);
    if (!Number.isFinite(intakeRequestId)) {
      return NextResponse.json({ error: 'Invalid intake request id.' }, { status: 400 });
    }

    const body = await req.json() as { kind?: string; entityId?: number };
    const { kind, entityId } = body;

    if (kind === undefined || !VALID_KINDS.includes(kind as BrainEntityKind)) {
      return NextResponse.json(
        { error: `kind is required and must be one of: ${VALID_KINDS.join(', ')}` },
        { status: 400 }
      );
    }

    if (entityId === undefined || entityId === null || !Number.isFinite(Number(entityId))) {
      return NextResponse.json({ error: 'entityId is required and must be numeric.' }, { status: 400 });
    }

    const current = await sql`SELECT id FROM intake_requests WHERE id = ${intakeRequestId}`;
    if (current.length === 0) {
      return NextResponse.json({ error: 'Intake request not found.' }, { status: 404 });
    }

    // fulfilled_entity_id has no real FK (the target table depends on kind),
    // so existence is checked explicitly here rather than relying on a DB
    // constraint to catch a bad reference.
    const entityExists = kind === 'dashboard'
      ? await sql`SELECT id FROM dashboards WHERE id = ${entityId}`
      : await sql`SELECT id FROM report_subscriptions WHERE id = ${entityId}`;

    if (entityExists.length === 0) {
      return NextResponse.json(
        { error: `entityId does not refer to an existing ${kind}.` },
        { status: 400 }
      );
    }

    const rows = await sql`
      UPDATE intake_requests
      SET status = 'fulfilled', fulfilled_entity_kind = ${kind}, fulfilled_entity_id = ${entityId}
      WHERE id = ${intakeRequestId}
      RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
    `;

    return NextResponse.json(mapIntakeRequestRow(rows[0]));
  } catch (err: unknown) {
    console.error('Convert intake request error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
