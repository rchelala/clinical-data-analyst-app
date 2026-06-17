"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { DashboardBrain } from "@/components/brain/DashboardBrain";
import { Division, DashboardWithUrgency } from "@/lib/brain-types";

export default function BrainPage() {
  const [currentAnalystId, setCurrentAnalystId] = useState<number | null>(null);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectAnalyst = useCallback((analystId: number) => {
    setCurrentAnalystId(analystId);
  }, []);

  useEffect(() => {
    if (currentAnalystId === null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [dashboardsRes, divisionsRes] = await Promise.all([
          fetch("/api/dashboards", {
            headers: { "x-analyst-id": String(currentAnalystId) },
          }),
          fetch("/api/divisions"),
        ]);

        const [dashboardsData, divisionsData] = await Promise.all([
          dashboardsRes.json(),
          divisionsRes.json(),
        ]);

        if (cancelled) return;

        if (!dashboardsRes.ok) {
          setError(dashboardsData.error ?? "Could not load dashboards.");
          return;
        }
        if (!divisionsRes.ok) {
          setError(divisionsData.error ?? "Could not load divisions.");
          return;
        }

        setDashboards(dashboardsData);
        setDivisions(divisionsData);
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAnalystId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-primary leading-none">
            Dashboard Brain
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Your dashboards, orbiting by urgency
          </p>
        </div>

        <AnalystSelector onSelect={handleSelectAnalyst} />
      </header>

      <main className="flex-1 overflow-hidden">
        {currentAnalystId !== null && loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <p className="text-sm text-secondary">Loading your dashboards…</p>
          </div>
        )}

        {currentAnalystId !== null && !loading && error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {currentAnalystId !== null && !loading && !error && dashboards.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-secondary">
              No dashboards assigned to you yet.
            </p>
          </div>
        )}

        {currentAnalystId !== null && !loading && !error && dashboards.length > 0 && (
          <DashboardBrain dashboards={dashboards} divisions={divisions} />
        )}
      </main>
    </div>
  );
}
