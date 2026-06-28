import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { RelatedRequestSummary } from '@/lib/brain-types';

async function getRelatedRequests(requestId: number): Promise<RelatedRequestSummary[]> {
  const rows = await sql`
    SELECT
      other.id, other.title, other.status,
      other.dashboard_id, other.subscription_id
    FROM request_links rl
    JOIN requests other
      ON other.id = (CASE WHEN rl.request_id_a = ${requestId} THEN rl.request_id_b ELSE rl.request_id_a END)
    WHERE rl.request_id_a = ${requestId} OR rl.request_id_b = ${requestId}
    ORDER BY other.title
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    dashboardId: row.dashboard_id,
    subscriptionId: row.subscription_id,
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    const body = await req.json() as { relatedRequestId?: number };
    const { relatedRequestId } = body;

    if (relatedRequestId === undefined || relatedRequestId === null || !Number.isFinite(relatedRequestId)) {
      return NextResponse.json(
        { error: 'relatedRequestId is required and must be numeric.' },
        { status: 400 }
      );
    }

    if (requestId === relatedRequestId) {
      return NextResponse.json(
        { error: 'Cannot link a request to itself.' },
        { status: 400 }
      );
    }

    const a = Math.min(requestId, relatedRequestId);
    const b = Math.max(requestId, relatedRequestId);

    await sql`
      INSERT INTO request_links (request_id_a, request_id_b)
      VALUES (${a}, ${b})
      ON CONFLICT DO NOTHING
    `;

    return NextResponse.json(await getRelatedRequests(requestId));
  } catch (err: unknown) {
    console.error('Create request link error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'One or both requests not found.' },
          { status: 400 }
        );
      }
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
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    const relatedRequestIdParam = req.nextUrl.searchParams.get('relatedRequestId');
    const relatedRequestId = Number(relatedRequestIdParam);
    if (!relatedRequestIdParam || !Number.isFinite(relatedRequestId)) {
      return NextResponse.json(
        { error: 'relatedRequestId query param is required and must be numeric.' },
        { status: 400 }
      );
    }

    const a = Math.min(requestId, relatedRequestId);
    const b = Math.max(requestId, relatedRequestId);

    await sql`
      DELETE FROM request_links
      WHERE request_id_a = ${a} AND request_id_b = ${b}
    `;

    return NextResponse.json(await getRelatedRequests(requestId));
  } catch (err: unknown) {
    console.error('Delete request link error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
