import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getMonthlySummaryData, monthLabel } from '@/lib/monthly-summary';
import { MonthlyMonthListItem } from '@/lib/brain-types';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// Monthly Summary report: tasks created in a given calendar month, rolled up
// by division and grouped by the dashboard/subscription/general context they
// belong to. GET with no `month` returns the archive rail (months with
// activity); GET with `?month=YYYY-MM` returns the full report for that month.
export async function GET(req: NextRequest) {
  try {
    const monthParam = req.nextUrl.searchParams.get('month');

    if (!monthParam) {
      return await getMonthList();
    }

    if (!MONTH_PATTERN.test(monthParam)) {
      return NextResponse.json({ error: 'Invalid month. Expected format: YYYY-MM.' }, { status: 400 });
    }

    const response = await getMonthlySummaryData(monthParam);
    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error('Monthly summary error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

async function getMonthList(): Promise<NextResponse> {
  const rows = await sql`
    SELECT to_char(created_date, 'YYYY-MM') AS month, COUNT(*) AS task_count
    FROM tasks
    WHERE created_date IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  const months: MonthlyMonthListItem[] = (rows as any[]).map((row) => ({
    month: row.month,
    label: monthLabel(row.month),
    taskCount: Number(row.task_count),
  }));

  return NextResponse.json(months);
}
