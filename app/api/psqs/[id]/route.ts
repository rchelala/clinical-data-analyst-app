import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapPsqRow } from '@/lib/brain-mappers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const psqId = Number(id);
    if (!Number.isFinite(psqId)) {
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
    };
    const { name, divisionId, year, status, tasks, comments, notes, enterpriseAnalyst } = body;

    if (
      name === undefined &&
      divisionId === undefined &&
      year === undefined &&
      status === undefined &&
      tasks === undefined &&
      comments === undefined &&
      notes === undefined &&
      enterpriseAnalyst === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    }

    const current = await sql`
      SELECT id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, created_date, last_touched_date
      FROM psqs
      WHERE id = ${psqId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Psq not found.' }, { status: 404 });
    }

    const merged = {
      name: name !== undefined ? name.trim() : current[0].name,
      divisionId: divisionId !== undefined ? divisionId : current[0].division_id,
      year: year !== undefined ? year : current[0].year,
      status: status !== undefined ? status : current[0].status,
      tasks: tasks !== undefined ? tasks : current[0].tasks,
      comments: comments !== undefined ? comments : current[0].comments,
      notes: notes !== undefined ? notes : current[0].notes,
      enterpriseAnalyst: enterpriseAnalyst !== undefined ? enterpriseAnalyst : current[0].enterprise_analyst,
    };

    const rows = await sql`
      UPDATE psqs
      SET name = ${merged.name}, division_id = ${merged.divisionId}, year = ${merged.year},
          status = ${merged.status}, tasks = ${merged.tasks}, comments = ${merged.comments},
          notes = ${merged.notes}, enterprise_analyst = ${merged.enterpriseAnalyst},
          last_touched_date = CURRENT_DATE
      WHERE id = ${psqId}
      RETURNING id, analyst_id, division_id, year, name, status, tasks, comments, notes, enterprise_analyst, created_date, last_touched_date
    `;

    return NextResponse.json(mapPsqRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update psq error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced divisionId does not exist' },
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
    const psqId = Number(id);
    if (!Number.isFinite(psqId)) {
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
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
