import { sql } from '@/lib/db';
import { monthRange } from '@/lib/dates';
import {
  DivisionMonthlySummary,
  MonthlyGroup,
  MonthlySummaryResponse,
  MonthlySummaryTotals,
  MonthlyTaskRow,
} from '@/lib/brain-types';

// timeZone must be UTC: the date below is built with Date.UTC(), so formatting
// in a negative-offset local zone (e.g. Phoenix, UTC-7) would roll midnight back
// to the previous day — and previous month at a month boundary — mislabeling it.
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function monthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  // Construct with UTC to avoid any local-timezone skew shifting the month.
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, monthNum - 1, 1)));
}

// timeZone must be UTC (paired with Date.UTC() below) for the same reason as
// MONTH_LABEL_FORMATTER above: formatting in a negative-offset local zone
// would roll the date back a day.
const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

// Timezone-safe date formatter for report exports (Word/Excel). Accepts a
// Postgres `date` value as it may arrive: a "YYYY-MM-DD" string, a full ISO
// timestamp string (Neon `date` columns can serialize as local midnight in
// UTC, e.g. "2026-07-03T07:00:00.000Z"), or a Date object. Only the
// "YYYY-MM-DD" date part is used — never parsed through `new Date(string)`
// directly — then rendered as e.g. "Jul 3, 2026".
export function formatReportDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const datePart = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [year, monthNum, day] = datePart.split('-').map(Number);
  if (!year || !monthNum || !day) return '';
  return REPORT_DATE_FORMATTER.format(new Date(Date.UTC(year, monthNum - 1, day)));
}

// Monthly Summary report data builder: tasks created in a given calendar
// month, rolled up by division and grouped by the dashboard/subscription/
// general context they belong to. Shared by the JSON API route and the
// Word/Excel export routes so the query/assembly logic lives in one place.
export async function getMonthlySummaryData(month: string): Promise<MonthlySummaryResponse> {
  const { startDate, endDateExclusive } = monthRange(month);

  // All in-scope tasks (created within the month, attached — directly or via
  // a dashboard/subscription — to a division), joined to their division,
  // parent (dashboard/subscription), and owner names. Psq-only and otherwise
  // unattached tasks have no resolvable division and are excluded by the
  // WHERE clause below, mirroring the [divisionId] route's task scoping.
  const taskRows = await sql`
    SELECT
      t.id, t.title, t.status, t.created_date, t.completed_date,
      COALESCE(t.division_id, d.division_id, s.division_id) AS division_id,
      dv.name AS division_name,
      CASE
        WHEN t.dashboard_id IS NOT NULL THEN 'dashboard'
        WHEN t.subscription_id IS NOT NULL THEN 'subscription'
        ELSE 'unlinked'
      END AS group_kind,
      t.dashboard_id,
      t.subscription_id,
      COALESCE(d.name, s.name) AS group_name,
      group_owner.name AS group_owner_name,
      owner.name AS owner_name
    FROM tasks t
    LEFT JOIN dashboards d ON d.id = t.dashboard_id
    LEFT JOIN report_subscriptions s ON s.id = t.subscription_id
    LEFT JOIN divisions dv ON dv.id = COALESCE(t.division_id, d.division_id, s.division_id)
    LEFT JOIN analysts group_owner ON group_owner.id = COALESCE(d.analyst_id, s.analyst_id)
    LEFT JOIN analysts owner ON owner.id = t.owner_analyst_id
    WHERE t.created_date >= ${startDate} AND t.created_date < ${endDateExclusive}
      AND (t.division_id IS NOT NULL OR d.division_id IS NOT NULL OR s.division_id IS NOT NULL)
    ORDER BY t.created_date DESC
  `;

  type DivisionAgg = {
    id: number;
    name: string;
    created: number;
    completed: number;
    groups: Map<string, { kind: 'dashboard' | 'subscription' | 'unlinked'; name: string; analystName: string | null; tasks: MonthlyTaskRow[] }>;
  };

  const divisionsById = new Map<number, DivisionAgg>();

  for (const row of taskRows as any[]) {
    const divisionId = Number(row.division_id);

    let division = divisionsById.get(divisionId);
    if (!division) {
      division = {
        id: divisionId,
        name: row.division_name,
        created: 0,
        completed: 0,
        groups: new Map(),
      };
      divisionsById.set(divisionId, division);
    }

    division.created += 1;
    if (row.status === 'done') division.completed += 1;

    const groupKind: 'dashboard' | 'subscription' | 'unlinked' = row.group_kind;
    const groupKey =
      groupKind === 'dashboard'
        ? `dashboard-${row.dashboard_id}`
        : groupKind === 'subscription'
        ? `subscription-${row.subscription_id}`
        : 'unlinked';

    let group = division.groups.get(groupKey);
    if (!group) {
      group = {
        kind: groupKind,
        name: groupKind === 'unlinked' ? 'General / Unlinked' : row.group_name,
        analystName: groupKind === 'unlinked' ? null : row.group_owner_name,
        tasks: [],
      };
      division.groups.set(groupKey, group);
    }

    const task: MonthlyTaskRow = {
      id: Number(row.id),
      title: row.title,
      status: row.status,
      ownerName: row.owner_name,
      createdDate: row.created_date,
      completedDate: row.completed_date,
    };
    group.tasks.push(task);
  }

  const groupKindOrder: Record<'dashboard' | 'subscription' | 'unlinked', number> = {
    dashboard: 0,
    subscription: 1,
    unlinked: 2,
  };

  const divisions: DivisionMonthlySummary[] = Array.from(divisionsById.values())
    .map((division) => {
      const groups: MonthlyGroup[] = Array.from(division.groups.values())
        .sort((a, b) => groupKindOrder[a.kind] - groupKindOrder[b.kind] || a.name.localeCompare(b.name))
        .map((group) => ({
          kind: group.kind,
          name: group.name,
          analystName: group.analystName,
          tasks: group.tasks,
        }));

      return {
        id: division.id,
        name: division.name,
        created: division.created,
        completed: division.completed,
        netOpen: division.created - division.completed,
        groups,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totals: MonthlySummaryTotals = divisions.reduce(
    (acc, division) => {
      acc.created += division.created;
      acc.completed += division.completed;
      return acc;
    },
    { divisions: divisions.length, created: 0, completed: 0, netOpen: 0 }
  );
  totals.netOpen = totals.created - totals.completed;

  return { month, totals, divisions };
}

// Filters an already-fetched monthly summary down to a set of division IDs and
// recomputes totals from the surviving divisions. Shared by the Word/Excel
// export routes so selection semantics stay identical between formats.
//
// `idsParam` is the raw comma-separated `divisions` query value (or null when
// absent). When null/blank the full report is returned untouched. Non-numeric
// or unknown IDs are ignored. `isFiltered` is true only when the surviving set
// is a strict subset of the full report (used to suffix export filenames).
export function filterSummaryByDivisionIds(
  data: MonthlySummaryResponse,
  idsParam: string | null,
): { divisions: DivisionMonthlySummary[]; totals: MonthlySummaryTotals; isFiltered: boolean } {
  if (!idsParam || !idsParam.trim()) {
    return { divisions: data.divisions, totals: data.totals, isFiltered: false };
  }

  const wanted = new Set<number>(
    idsParam
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => Number(part))
      .filter((n) => Number.isInteger(n)),
  );

  const divisions = data.divisions.filter((division) => wanted.has(division.id));

  const totals: MonthlySummaryTotals = divisions.reduce(
    (acc, division) => {
      acc.created += division.created;
      acc.completed += division.completed;
      return acc;
    },
    { divisions: divisions.length, created: 0, completed: 0, netOpen: 0 },
  );
  totals.netOpen = totals.created - totals.completed;

  return { divisions, totals, isFiltered: divisions.length !== data.divisions.length };
}
