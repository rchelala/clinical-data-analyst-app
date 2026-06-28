import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { RelatedRequestSummary } from '@/lib/brain-types';

export async function GET(req: NextRequest) {
  try {
    const qParam = req.nextUrl.searchParams.get('q');
    const q = qParam?.trim() ?? '';
    if (!q) {
      return NextResponse.json({ error: 'q query parameter is required.' }, { status: 400 });
    }

    const excludeIdParam = req.nextUrl.searchParams.get('excludeId');
    let excludeId: number | undefined;
    if (excludeIdParam !== null) {
      excludeId = Number(excludeIdParam);
      if (!Number.isFinite(excludeId)) {
        return NextResponse.json(
          { error: 'excludeId query parameter must be numeric.' },
          { status: 400 }
        );
      }
    }

    const rows = await sql`
      SELECT
        r.id, r.title, r.status, r.dashboard_id, r.subscription_id,
        COALESCE(d.name, s.name) AS context_name
      FROM requests r
      LEFT JOIN dashboards d ON d.id = r.dashboard_id
      LEFT JOIN report_subscriptions s ON s.id = r.subscription_id
      WHERE r.title ILIKE ${'%' + q + '%'}
        AND r.id != ${excludeId ?? -1}
      ORDER BY r.title
      LIMIT 20
    `;

    const results: RelatedRequestSummary[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      dashboardId: row.dashboard_id,
      subscriptionId: row.subscription_id,
      contextName: row.context_name ?? undefined,
    }));

    return NextResponse.json(results);
  } catch (err: unknown) {
    console.error('Search requests error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
