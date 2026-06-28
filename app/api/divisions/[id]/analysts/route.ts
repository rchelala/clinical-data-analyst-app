import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapDivisionAnalystCoverageRow } from '@/lib/brain-mappers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const divisionId = Number(id);
    if (!Number.isFinite(divisionId)) {
      return NextResponse.json({ error: 'Invalid division id.' }, { status: 400 });
    }

    const divisionRows = await sql`
      SELECT id FROM divisions WHERE id = ${divisionId}
    `;

    if (divisionRows.length === 0) {
      return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
    }

    const rows = await sql`
      SELECT a.id, a.name,
        COUNT(DISTINCT d.id) AS dashboard_count,
        COUNT(DISTINCT s.id) AS subscription_count
      FROM analysts a
      LEFT JOIN dashboards d ON d.analyst_id = a.id AND d.division_id = ${divisionId}
      LEFT JOIN report_subscriptions s ON s.analyst_id = a.id AND s.division_id = ${divisionId}
      GROUP BY a.id, a.name
      HAVING COUNT(DISTINCT d.id) > 0 OR COUNT(DISTINCT s.id) > 0
      ORDER BY a.name
    `;

    return NextResponse.json(rows.map(mapDivisionAnalystCoverageRow));
  } catch (err: unknown) {
    console.error('List division analyst coverage error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
