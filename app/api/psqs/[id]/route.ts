import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapPsqRow } from '@/lib/brain-mappers';
import { isValidDateString } from '@/lib/dates';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const psqId = Number(id);
    if (!Number.isInteger(psqId)) {
      return NextResponse.json({ error: 'Invalid psq id.' }, { status: 400 });
    }

    const body = await req.json() as {
      name?: string;
      divisionId?: number | null;
      year?: number | null;
      status?: string | null;
      tasks?: string | null;
      comments?: string | null;
      notes?: string | null;
      enterpriseAnalyst?: string | null;
      summary?: string | null;
      dashboardId?: number | null;
      clientDate?: string | null;
    };
    const { name, divisionId, year, status, tasks, comments, notes, enterpriseAnalyst, summary, dashboardId, clientDate } = body;

    if (
      name === undefined &&
      divisionId === undefined &&
      year === undefined &&
      status === undefined &&
      tasks === undefined &&
      comments === undefined &&
      notes === undefined &&
      enterpriseAnalyst === undefined &&
      summary === undefined &&
      dashboardId === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    }

    if (clientDate !== undefined && clientDate !== null && !isValidDateString(clientDate)) {
      return NextResponse.json(
        { error: 'clientDate must be a valid YYYY-MM-DD date.' },
        { status: 400 }
      );
    }

    // Single UPDATE that only touches columns actually present in the body
    // (via a CASE per column keyed on a "was this field provided" flag) —
    // no read-merge-write, so a concurrent PATCH to a *different* field on
    // the same psq can't clobber this one's change. 404 comes from
    // UPDATE...RETURNING finding no matching row.
    const trimmedName = name !== undefined ? name.trim() : undefined;
    const hasName = trimmedName !== undefined;
    const hasDivisionId = divisionId !== undefined;
    const hasYear = year !== undefined;
    const hasStatus = status !== undefined;
    const hasTasks = tasks !== undefined;
    const hasComments = comments !== undefined;
    const hasNotes = notes !== undefined;
    const hasEnterpriseAnalyst = enterpriseAnalyst !== undefined;
    const hasSummary = summary !== undefined;
    const hasDashboardId = dashboardId !== undefined;

    // last_touched_date always stamps on a PATCH — with the caller's local
    // date when provided (see lib/dates.ts toLocalDateString), falling back
    // to the server's CURRENT_DATE (UTC on Netlify) only when the client
    // didn't send one.
    const rows = await sql`
      UPDATE psqs
      SET
        name = CASE WHEN ${hasName} THEN ${trimmedName ?? null}::text ELSE name END,
        division_id = CASE WHEN ${hasDivisionId} THEN ${divisionId ?? null}::int ELSE division_id END,
        year = CASE WHEN ${hasYear} THEN ${year ?? null}::int ELSE year END,
        status = CASE WHEN ${hasStatus} THEN ${status ?? null}::text ELSE status END,
        tasks = CASE WHEN ${hasTasks} THEN ${tasks ?? null}::text ELSE tasks END,
        comments = CASE WHEN ${hasComments} THEN ${comments ?? null}::text ELSE comments END,
        notes = CASE WHEN ${hasNotes} THEN ${notes ?? null}::text ELSE notes END,
        enterprise_analyst = CASE WHEN ${hasEnterpriseAnalyst} THEN ${enterpriseAnalyst ?? null}::text ELSE enterprise_analyst END,
        summary = CASE WHEN ${hasSummary} THEN ${summary ?? null}::text ELSE summary END,
        dashboard_id = CASE WHEN ${hasDashboardId} THEN ${dashboardId ?? null}::int ELSE dashboard_id END,
        last_touched_date = CASE WHEN ${!!clientDate} THEN ${clientDate ?? null}::date ELSE CURRENT_DATE END
      WHERE id = ${psqId}
      RETURNING id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, summary, created_date, last_touched_date, dashboard_id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Psq not found.' }, { status: 404 });
    }

    return NextResponse.json(mapPsqRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update psq error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId/dashboardId does not exist' },
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
    const psqId = Number(id);
    if (!Number.isInteger(psqId)) {
      return NextResponse.json({ error: 'Invalid psq id.' }, { status: 400 });
    }

    const rows = await sql`
      DELETE FROM psqs
      WHERE id = ${psqId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Psq not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: psqId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete psq error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
