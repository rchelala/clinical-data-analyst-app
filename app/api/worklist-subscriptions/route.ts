import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapReportSubscriptionRow } from '@/lib/brain-mappers';

// Report subscriptions appear on an analyst's worklist by ownership
// (report_subscriptions.analyst_id), not via an explicit membership table the
// way dashboards do — so this is a read-only list of the analyst's owned
// subscriptions, enriched with the active (non-done) task count the worklist
// uses for its "active only" filter. Mirrors the shape worklist-dashboards
// returns so the page can render both in one unified section.
export async function GET(req: NextRequest) {
  try {
    const analystIdParam = req.nextUrl.searchParams.get('analystId');
    const analystId = analystIdParam ? Number(analystIdParam) : NaN;

    if (!analystIdParam || !Number.isFinite(analystId)) {
      return NextResponse.json(
        { error: 'analystId query param is required and must be numeric.' },
        { status: 400 }
      );
    }

    const rows = await sql`
      SELECT s.*, owner.name AS analyst_name, COALESCE(tc.active_count, 0) AS active_task_count
      FROM report_subscriptions s
      LEFT JOIN analysts owner ON owner.id = s.analyst_id
      LEFT JOIN (
        SELECT subscription_id, COUNT(*) AS active_count
        FROM tasks
        WHERE owner_analyst_id = ${analystId} AND status <> 'done' AND subscription_id IS NOT NULL
        GROUP BY subscription_id
      ) tc ON tc.subscription_id = s.id
      WHERE s.analyst_id = ${analystId}
      ORDER BY s.priority NULLS LAST, s.name
    `;

    const result = rows.map((row: any) => ({
      ...mapReportSubscriptionRow(row),
      ownerName: row.analyst_name,
      isCovering: false,
      activeTaskCount: Number(row.active_task_count),
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('List worklist subscriptions error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
