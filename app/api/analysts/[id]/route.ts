import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapAnalystRow } from '@/lib/brain-mappers';

// Rename and retire/un-retire. No DELETE: analysts are referenced by FK from
// tasks, dashboards, subscriptions, divisions, psqs and weekly notes, so
// removing a row would take their history with it. Retiring hides them instead.
//
// Last writer wins if two people edit the same analyst at once (one retires
// while another renames). Not worth locking for a team of this size.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analystId = Number(id);
    if (!Number.isFinite(analystId)) {
      return NextResponse.json({ error: 'Invalid analyst id.' }, { status: 400 });
    }

    const body = await req.json() as { name?: string; isActive?: boolean };
    const { name, isActive } = body;

    if (name === undefined && isActive === undefined) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    }

    const current = await sql`
      SELECT id, name, is_active FROM analysts WHERE id = ${analystId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Analyst not found.' }, { status: 404 });
    }

    // Never leave the roster empty — nobody could pick an identity afterwards.
    if (isActive === false && current[0].is_active === true) {
      const activeCount = await sql`SELECT COUNT(*)::int AS count FROM analysts WHERE is_active`;
      if (activeCount[0].count <= 1) {
        return NextResponse.json(
          { error: 'You cannot retire the last active analyst.' },
          { status: 400 }
        );
      }
    }

    const merged = {
      name: name !== undefined ? name.trim() : current[0].name,
      isActive: isActive !== undefined ? isActive : current[0].is_active,
    };

    const rows = await sql`
      UPDATE analysts
      SET name = ${merged.name}, is_active = ${merged.isActive}
      WHERE id = ${analystId}
      RETURNING id, name, is_active
    `;

    return NextResponse.json(mapAnalystRow(rows[0]));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'An analyst with this name already exists.' },
        { status: 409 }
      );
    }
    console.error('Update analyst error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
