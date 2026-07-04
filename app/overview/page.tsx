"use client";

// Division Overview page: engagement and delivery across the divisions
// we support. This page is deliberately CUSTOMER-facing (divisions) and
// TEAM-WIDE (aggregate delivery totals) — it never shows per-analyst
// breakdowns or "who did what" rankings (see the framing rule in the
// implementation task). Fetch-in-useEffect + useState(loading/error)
// mirrors app/brain/unassigned/page.tsx's pattern; page owns fetch/state/
// filter, presentational pieces live in components/overview/.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Home,
  ClipboardList,
  Loader2,
  Building2,
  LayoutDashboard,
  Mail,
  AlertCircle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { OverviewResponse } from "@/lib/brain-types";
import { KpiCard } from "@/components/overview/KpiCard";
import { DeliveryChart } from "@/components/overview/DeliveryChart";
import { DivisionEngagementCard } from "@/components/overview/DivisionEngagementCard";
import { EngagementInfoButton } from "@/components/overview/EngagementInfoButton";

type SortOption = "engagement" | "subscriptions" | "demand" | "recent";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "engagement", label: "Engagement" },
  { value: "subscriptions", label: "Active subscriptions" },
  { value: "demand", label: "Demand" },
  { value: "recent", label: "Recent delivery" },
];

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("engagement");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/overview");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Could not load the division overview.");
        setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDivisions = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.divisions.filter((d) => d.name.toLowerCase().includes(q))
      : data.divisions.slice();

    switch (sortBy) {
      case "subscriptions":
        return filtered.sort((a, b) => b.activeSubscriptions - a.activeSubscriptions || a.name.localeCompare(b.name));
      case "demand":
        return filtered.sort((a, b) => {
          const demandA = a.openRequests + a.inProgressRequests + a.openTasks;
          const demandB = b.openRequests + b.inProgressRequests + b.openTasks;
          return demandB - demandA || a.name.localeCompare(b.name);
        });
      case "recent":
        return filtered.sort((a, b) => {
          // Null (no recent activity) always sorts last.
          if (a.daysSinceActivity === null && b.daysSinceActivity === null) return a.name.localeCompare(b.name);
          if (a.daysSinceActivity === null) return 1;
          if (b.daysSinceActivity === null) return -1;
          return a.daysSinceActivity - b.daysSinceActivity || a.name.localeCompare(b.name);
        });
      case "engagement":
      default:
        // Divisions already arrive engagementScore desc, then name — but the
        // search filter preserves relative order, so no re-sort is needed.
        return filtered;
    }
  }, [data, search, sortBy]);

  return (
    <div className="flex flex-col h-screen md:overflow-hidden overflow-y-auto">
      <div className="eclipse-glow" />
      <div className="eclipse-grain" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
        {/* Mobile nav bar (below md) */}
        <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0">
          <MobileNav active="overview" />
          <span className="text-sm font-medium text-primary">Overview</span>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/brain"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Brain
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
              Division Overview
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              Engagement and delivery across the divisions we support.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <p className="text-sm text-secondary">Loading…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="Divisions covered" value={data.totals.divisionsCovered} icon={Building2} />
              <KpiCard label="Active dashboards" value={data.totals.activeDashboards} icon={LayoutDashboard} />
              <KpiCard label="Active subscriptions" value={data.totals.activeSubscriptions} icon={Mail} />
              <KpiCard
                label="Requests completed (90d)"
                value={data.totals.requestsCompletedRecent}
                icon={CheckCircle2}
              />
              <KpiCard
                label="Open requests"
                value={data.totals.openRequests}
                icon={AlertCircle}
                danger={data.totals.openRequests > 0}
              />
            </div>

            {/* Team delivery chart */}
            <DeliveryChart data={data.throughput} />

            {/* Division engagement list */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-primary">Division engagement</h2>
                <EngagementInfoButton />
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search division…"
                    className="w-full text-xs rounded-md border border-theme pl-8 pr-2.5 py-1.5 bg-panel text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <select
                  aria-label="Sort divisions"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="ml-auto text-xs rounded-md border border-theme px-2.5 py-1.5 bg-panel text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Sort: {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {filteredDivisions.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-secondary">No divisions match your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredDivisions.map((division) => (
                    <DivisionEngagementCard key={division.id} division={division} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
