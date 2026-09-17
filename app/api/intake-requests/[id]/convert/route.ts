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

    // fulfilled_entity_id has no real FK (the target table depends on kind),
    // so existence is checked explicitly here rather than relying on a DB
    // constraint to catch a bad reference. Instead of three sequential round
    // trips (existence check, entity check, update), this does the update
    // guarded by an EXISTS clause and reports both existence flags in the
    // same query so the two distinct error cases (404 vs 400) can still be
    // told apart from a single round trip.
    const rows = kind === 'dashboard'
      ? await sql`
          WITH updated AS (
            UPDATE intake_requests
            SET status = 'fulfilled', fulfilled_entity_kind = ${kind}, fulfilled_entity_id = ${entityId}
            WHERE id = ${intakeRequestId}
              AND EXISTS (SELECT 1 FROM dashboards WHERE id = ${entityId})
            RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
          )
          SELECT
            (SELECT EXISTS(SELECT 1 FROM intake_requests WHERE id = ${intakeRequestId})) AS intake_exists,
            (SELECT EXISTS(SELECT 1 FROM dashboards WHERE id = ${entityId})) AS entity_exists,
            u.*
          FROM (SELECT 1) AS x
          LEFT JOIN updated u ON true
        `
      : await sql`
          WITH updated AS (
            UPDATE intake_requests
            SET status = 'fulfilled', fulfilled_entity_kind = ${kind}, fulfilled_entity_id = ${entityId}
            WHERE id = ${intakeRequestId}
              AND EXISTS (SELECT 1 FROM report_subscriptions WHERE id = ${entityId})
            RETURNING id, priority, date_received, division_id, topic, stakeholder, analyst_id, requested_kind, status, ticket_link, internal_comments, created_date, fulfilled_entity_kind, fulfilled_entity_id
          )
          SELECT
            (SELECT EXISTS(SELECT 1 FROM intake_requests WHERE id = ${intakeRequestId})) AS intake_exists,
            (SELECT EXISTS(SELECT 1 FROM report_subscriptions WHERE id = ${entityId})) AS entity_exists,
            u.*
          FROM (SELECT 1) AS x
          LEFT JOIN updated u ON true
        `;

    const row = rows[0] as any;
    if (!row.intake_exists) {
      return NextResponse.json({ error: 'Intake request not found.' }, { status: 404 });
    }
    if (!row.entity_exists) {
      return NextResponse.json(
        { error: `entityId does not refer to an existing ${kind}.` },
        { status: 400 }
      );
    }

    return NextResponse.json(mapIntakeRequestRow(row));
  } catch (err: unknown) {
    console.error('Convert intake request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
