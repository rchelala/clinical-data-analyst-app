"use client";

// Standalone list page for the Intake "Unassigned" backlog
// (GALAXY_VIEW_SPEC-adjacent feature, not part of the canvas/zoom-state
// machinery). Filter rail + fetch/state logic live here; the actual table
// markup is extracted to components/brain/IntakeRequestsTable.tsx so later
// inline-row-edit work (a separate task) has an isolated place to land.
// Styled by hand from app/brain/page.tsx + FilterRail.tsx's existing
// Tailwind conventions (bg-panel/border-theme/text-secondary/brand-600).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ClipboardList } from "lucide-react";
import {
  Analyst,
  Division,
  IntakePriority,
  IntakeRequestWithNames,
  IntakeStatus,
} from "@/lib/brain-types";
import { IntakeRequestsTable } from "@/components/brain/IntakeRequestsTable";

const STATUS_OPTIONS: { value: IntakeStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "discovery", label: "Discovery" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "fulfilled", label: "Fulfilled" },
];

const PRIORITY_OPTIONS: { value: IntakePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function UnassignedIntakePage() {
  const [requests, setRequests] = useState<IntakeRequestWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  const [statusFilter, setStatusFilter] = useState<IntakeStatus | "all">("all");
  const [divisionFilter, setDivisionFilter] = useState<number | "all">("all");
  const [analystFilter, setAnalystFilter] = useState<number | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IntakePriority | "all">("all");
  const [showFulfilled, setShowFulfilled] = useState(false);

  // Reference data for the division/analyst dropdowns, fetched the same way
  // app/brain/page.tsx loads its unscoped "all" lists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [divisionsRes, analystsRes] = await Promise.all([
          fetch("/api/divisions"),
          fetch("/api/analysts"),
        ]);
        const divisionsData = await divisionsRes.json();
        const analystsData = await analystsRes.json();
        if (cancelled) return;
        if (divisionsRes.ok) setDivisions(divisionsData);
        if (analystsRes.ok) setAnalysts(analystsData);
      } catch {
        // Non-critical: dropdowns just render empty if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetches the intake list. The API only supports a single exact-match
  // ?status= filter (no "all including fulfilled" mode), so:
  //   - If an explicit status filter is chosen, fetch exactly that status
  //     (this already includes 'fulfilled' if that's what's picked, and the
  //     showFulfilled toggle becomes moot/ignored in that case).
  //   - Otherwise, fetch the default (non-fulfilled) list, and if
  //     "show fulfilled" is on, ALSO fetch ?status=fulfilled and concatenate
  //     the two results client-side. Two requests is simpler than teaching
  //     the API a new filter mode for this one page.
  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (statusFilter !== "all") {
        const res = await fetch(`/api/intake-requests?status=${statusFilter}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load intake requests.");
        setRequests(data);
        return;
      }

      if (showFulfilled) {
        const [baseRes, fulfilledRes] = await Promise.all([
          fetch("/api/intake-requests"),
          fetch("/api/intake-requests?status=fulfilled"),
        ]);
        const baseData = await baseRes.json();
        const fulfilledData = await fulfilledRes.json();
        if (!baseRes.ok) throw new Error(baseData.error ?? "Could not load intake requests.");
        if (!fulfilledRes.ok) throw new Error(fulfilledData.error ?? "Could not load fulfilled requests.");
        setRequests([...baseData, ...fulfilledData]);
        return;
      }

      const res = await fetch("/api/intake-requests");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load intake requests.");
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showFulfilled]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => (divisionFilter === "all" ? true : r.divisionId === divisionFilter))
      .filter((r) => (analystFilter === "all" ? true : r.analystId === analystFilter))
      .filter((r) => (priorityFilter === "all" ? true : r.priority === priorityFilter))
      .sort(
        (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
      );
  }, [requests, divisionFilter, analystFilter, priorityFilter]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/brain"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Brain
          </Link>
          <div>
            <h1 className="text-base font-semibold text-primary leading-none">
              Unassigned Requests
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              Intake backlog of dashboard/subscription requests not yet owned by an analyst.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* "Add request" is intentionally a no-op placeholder here — wiring
              up the create form is a separate follow-on task. */}
          <button
            disabled
            title="Coming soon"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary opacity-60 cursor-not-allowed"
          >
            <ClipboardList className="w-3 h-3" />
            Add Request
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-row">
        <aside className="w-56 flex-shrink-0 h-full overflow-y-auto border-r border-theme bg-secondary-glass px-3 py-4 flex flex-col gap-5">
          <div>
            <label
              htmlFor="unassigned-status-filter"
              className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5 block"
            >
              Status
            </label>
            <select
              id="unassigned-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as IntakeStatus | "all")}
              className="w-full text-xs rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="unassigned-division-filter"
              className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5 block"
            >
              Division
            </label>
            <select
              id="unassigned-division-filter"
              value={divisionFilter}
              onChange={(e) =>
                setDivisionFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="w-full text-xs rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="unassigned-analyst-filter"
              className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5 block"
            >
              Analyst
            </label>
            <select
              id="unassigned-analyst-filter"
              value={analystFilter}
              onChange={(e) =>
                setAnalystFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="w-full text-xs rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All</option>
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="unassigned-priority-filter"
              className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5 block"
            >
              Priority
            </label>
            <select
              id="unassigned-priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as IntakePriority | "all")}
              className="w-full text-xs rounded-md border border-theme px-2 py-1.5 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All</option>
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={showFulfilled}
                onChange={(e) => setShowFulfilled(e.target.checked)}
                disabled={statusFilter !== "all"}
                className="w-3.5 h-3.5 accent-brand-500"
              />
              Show fulfilled
            </label>
            {statusFilter !== "all" && (
              <p className="text-[11px] text-secondary mt-1">
                Ignored while a specific status filter is selected.
              </p>
            )}
          </div>
        </aside>

        <div className="relative flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              <p className="text-sm text-secondary">Loading…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && filteredRequests.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-secondary">No requests match the current filters.</p>
            </div>
          )}

          {!loading && !error && filteredRequests.length > 0 && (
            <IntakeRequestsTable requests={filteredRequests} />
          )}
        </div>
      </main>
    </div>
  );
}
