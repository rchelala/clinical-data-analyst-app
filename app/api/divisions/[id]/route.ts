import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const divisionId = Number(id);
    if (!Number.isFinite(divisionId)) {
      return NextResponse.json({ error: 'Invalid division id.' }, { status: 400 });
    }

    const rows = await sql`
      DELETE FROM divisions
      WHERE id = ${divisionId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: divisionId });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'This division still has dashboards or report subscriptions linked to it. Move or delete them first.' },
        { status: 409 }
      );
    }
    console.error('Delete division error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
