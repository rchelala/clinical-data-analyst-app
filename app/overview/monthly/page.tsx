"use client";

// Monthly Summary report: a left archive rail of months (grouped by year)
// paired with a main report column showing KPIs and a per-division
// Division -> group (dashboard/subscription/General) -> task tree for the
// selected month. Mirrors app/overview/page.tsx's scaffold (eclipse
// glow/grain background, header shell, fetch-in-useEffect loading/error
// pattern, max-w-6xl container) and reuses KpiCard / DetailSection's table
// language plus StatusBadge's TaskStatusBadge + OwnerChip for the task rows.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Home,
  ClipboardList,
  Loader2,
  Building2,
  PlusCircle,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Mail,
  FolderOpen,
} from "lucide-react";
import {
  MonthlySummaryResponse,
  MonthlyMonthListItem,
  DivisionMonthlySummary,
  MonthlyGroup,
} from "@/lib/brain-types";
import { KpiCard } from "@/components/overview/KpiCard";
import { TaskStatusBadge, OwnerChip } from "@/components/overview/StatusBadge";
import { TH_CLASS, TD_CLASS } from "@/components/overview/DetailSection";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function yearOf(month: string): string {
  return month.slice(0, 4);
}

const GROUP_ICON: Record<MonthlyGroup["kind"], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  subscription: Mail,
  unlinked: FolderOpen,
};

interface MonthlyDivisionCardProps {
  division: DivisionMonthlySummary;
}

function MonthlyDivisionCard({ division }: MonthlyDivisionCardProps) {
  return (
    <section className="rounded-lg border border-theme bg-panel shadow-panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-theme">
        <h3 className="text-sm font-semibold text-primary">{division.name}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-secondary bg-white/5 px-2 py-0.5 rounded-md whitespace-nowrap">
            {division.created} new · {division.completed} done
          </span>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
              division.netOpen > 0
                ? "bg-amber-500/10 text-amber-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}
          >
            Net open {division.netOpen}
          </span>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {division.groups.length === 0 ? (
          <p className="text-xs text-secondary px-4 py-6 text-center">
            No activity for this division this month.
          </p>
        ) : (
          division.groups.map((group, i) => {
            const Icon = GROUP_ICON[group.kind];
            return (
              <div key={`${group.kind}-${group.name}-${i}`} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-primary">
                  <Icon className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                  {group.name}
                  {group.analystName && (
                    <span className="text-secondary font-normal">— {group.analystName}</span>
                  )}
                </div>
                <div className="border-l-2 border-white/10 pl-3 ml-1.5 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr>
                        <th className={TH_CLASS}>Task</th>
                        <th className={TH_CLASS}>Status</th>
                        <th className={TH_CLASS}>Owner</th>
                        <th className={TH_CLASS}>Created</th>
                        <th className={TH_CLASS}>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className={`${TD_CLASS} text-primary font-medium`}>{task.title}</td>
                          <td className={TD_CLASS}>
                            <TaskStatusBadge status={task.status} />
                          </td>
                          <td className={TD_CLASS}>
                            <OwnerChip name={task.ownerName} />
                          </td>
                          <td className={`${TD_CLASS} text-secondary`}>{formatDate(task.createdDate)}</td>
                          <td className={`${TD_CLASS} text-secondary`}>{formatDate(task.completedDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default function MonthlySummaryPage() {
  const [months, setMonths] = useState<MonthlyMonthListItem[] | null>(null);
  const [monthsLoading, setMonthsLoading] = useState(true);
  const [monthsError, setMonthsError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const [summary, setSummary] = useState<MonthlySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Load the month list once, then default-select the newest month.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMonthsLoading(true);
      setMonthsError(null);
      try {
        const res = await fetch("/api/overview/monthly-summary");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Could not load the monthly archive.");
        const list: MonthlyMonthListItem[] = json;
        setMonths(list);
        if (list.length > 0) setSelectedMonth(list[0].month);
      } catch (err) {
        if (!cancelled) {
          setMonthsError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      } finally {
        if (!cancelled) setMonthsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected month's summary whenever it changes.
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await fetch(`/api/overview/monthly-summary?month=${selectedMonth}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Could not load this month's summary.");
        setSummary(json);
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const monthsByYear = useMemo(() => {
    if (!months) return [];
    const groups = new Map<string, MonthlyMonthListItem[]>();
    for (const m of months) {
      const year = yearOf(m.month);
      const bucket = groups.get(year);
      if (bucket) bucket.push(m);
      else groups.set(year, [m]);
    }
    return Array.from(groups.entries());
  }, [months]);

  const selectedLabel = useMemo(() => {
    if (!selectedMonth || !months) return null;
    return months.find((m) => m.month === selectedMonth)?.label ?? selectedMonth;
  }, [selectedMonth, months]);

  const excelHref = selectedMonth ? `/api/overview/monthly-summary/excel?month=${selectedMonth}` : undefined;
  const wordHref = selectedMonth ? `/api/overview/monthly-summary/word?month=${selectedMonth}` : undefined;

  return (
    <div className="flex flex-col h-screen md:overflow-hidden overflow-y-auto">
      <div className="eclipse-glow" />
      <div className="eclipse-grain" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/overview"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Overview
          </Link>
          <Link
            href="/worklist"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <ClipboardList className="w-3 h-3" />
            Worklist
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <Home className="w-3 h-3" />
            Home
          </Link>
          <div>
            <h1 className="text-base font-semibold text-primary leading-none">
              Monthly Summary{selectedLabel ? ` — ${selectedLabel}` : ""}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              Task activity by division for the selected month.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={excelHref}
            aria-disabled={!excelHref}
            onClick={(e) => {
              if (!excelHref) e.preventDefault();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors ${
              !excelHref ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </a>
          <a
            href={wordHref}
            aria-disabled={!wordHref}
            onClick={(e) => {
              if (!wordHref) e.preventDefault();
            }}
            className={`btn-shimmer flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md hover:brightness-110 transition-all duration-200 ${
              !wordHref ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Word
          </a>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {monthsLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <p className="text-sm text-secondary">Loading…</p>
          </div>
        )}

        {!monthsLoading && monthsError && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-400">{monthsError}</p>
          </div>
        )}

        {!monthsLoading && !monthsError && months && months.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-secondary">No monthly activity has been recorded yet.</p>
          </div>
        )}

        {!monthsLoading && !monthsError && months && months.length > 0 && (
          <div className="flex flex-col md:flex-row gap-6 max-w-6xl mx-auto">
            {/* Archive rail */}
            <aside className="w-full md:w-1/3 md:max-w-[260px] flex-shrink-0">
              <div className="rounded-lg border border-theme bg-panel shadow-panel p-3 flex flex-col gap-3 md:sticky md:top-6">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-secondary px-1">
                  Archive
                </h2>
                {monthsByYear.map(([year, items]) => (
                  <div key={year}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary px-1 mb-1">
                      {year}
                    </p>
                    <div className="flex flex-col gap-1">
                      {items.map((m) => {
                        const active = m.month === selectedMonth;
                        return (
                          <button
                            key={m.month}
                            type="button"
                            onClick={() => setSelectedMonth(m.month)}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors border ${
                              active
                                ? "bg-brand-500/10 border-brand-500/40 text-primary font-medium"
                                : "border-transparent text-secondary hover:text-primary hover:bg-white/5"
                            }`}
                          >
                            <span>{m.label}</span>
                            <span className="text-[10px] text-secondary flex-shrink-0">{m.taskCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* Main report column */}
            <div className="flex-1 min-w-0 flex flex-col gap-6">
              {summaryLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                  <p className="text-sm text-secondary">Loading…</p>
                </div>
              )}

              {!summaryLoading && summaryError && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-red-400">{summaryError}</p>
                </div>
              )}

              {!summaryLoading && !summaryError && summary && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Divisions" value={summary.totals.divisions} icon={Building2} />
                    <KpiCard label="New" value={summary.totals.created} icon={PlusCircle} />
                    <KpiCard label="Completed" value={summary.totals.completed} icon={CheckCircle2} />
                    <KpiCard
                      label="Net open"
                      value={summary.totals.netOpen}
                      icon={TrendingUp}
                      danger={summary.totals.netOpen > 0}
                    />
                  </div>

                  {summary.divisions.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                      <p className="text-sm text-secondary">No activity this month.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {summary.divisions.map((division) => (
                        <MonthlyDivisionCard key={division.id} division={division} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
