"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ClipboardPlus } from "lucide-react";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { DashboardBrain } from "@/components/brain/DashboardBrain";
import { RequestSidePanel } from "@/components/brain/RequestSidePanel";
import { AddRequestForm } from "@/components/brain/AddRequestForm";
import { Division, DashboardWithUrgency } from "@/lib/brain-types";

export default function BrainPage() {
  const [currentAnalystId, setCurrentAnalystId] = useState<number | null>(null);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // All dashboards (not scoped to the current analyst), used to populate the
  // "Add Request" dashboard dropdown per the design doc.
  const [allDashboards, setAllDashboards] = useState<DashboardWithUrgency[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);
  const [showAddRequestForm, setShowAddRequestForm] = useState(false);
  // Bumping this re-runs the dashboards-fetching effect below, letting us
  // refresh urgency/counts after a new request is created.
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectAnalyst = useCallback((analystId: number) => {
    setCurrentAnalystId(analystId);
  }, []);

  // Shared fetch-and-parse logic for /api/dashboards, used by both the
  // analyst-scoped fetch and the unscoped "all dashboards" fetch below.
  // Throws on network/HTTP error so callers can handle cancellation and
  // state-setting in their own try/catch.
  const fetchDashboards = useCallback(
    async (headers?: HeadersInit): Promise<DashboardWithUrgency[]> => {
      const res = await fetch("/api/dashboards", headers ? { headers } : undefined);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not load dashboards.");
      }
      return data;
    },
    []
  );

  useEffect(() => {
    if (currentAnalystId === null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [dashboardsData, divisionsRes] = await Promise.all([
          fetchDashboards({ "x-analyst-id": String(currentAnalystId) }),
          fetch("/api/divisions"),
        ]);

        const divisionsData = await divisionsRes.json();

        if (cancelled) return;

        if (!divisionsRes.ok) {
          setError(divisionsData.error ?? "Could not load divisions.");
          return;
        }

        setDashboards(dashboardsData);
        setDivisions(divisionsData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error — could not reach the server.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAnalystId, refreshKey, fetchDashboards]);

  // Separate, non-blocking fetch of ALL dashboards (no x-analyst-id header)
  // for the Add Request form's dashboard dropdown. Doesn't gate the main
  // view. Triggered when the form opens rather than on every refreshKey
  // bump, since the dashboard list rarely changes just from adding a request.
  useEffect(() => {
    if (currentAnalystId === null || !showAddRequestForm) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchDashboards();
        if (!cancelled) setAllDashboards(data);
      } catch {
        // Non-critical for the main view; the Add Request form will simply
        // show an empty dashboard list if this fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAnalystId, showAddRequestForm, fetchDashboards]);

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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddRequestForm(true)}
            disabled={currentAnalystId === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Request
          </button>
          <AnalystSelector onSelect={handleSelectAnalyst} />
        </div>
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
          <DashboardBrain
            dashboards={dashboards}
            divisions={divisions}
            onSelectDashboard={(id) => setSelectedDashboardId(id)}
          />
        )}
      </main>

      <RequestSidePanel
        dashboard={dashboards.find((d) => d.id === selectedDashboardId) ?? null}
        onClose={() => setSelectedDashboardId(null)}
      />

      {showAddRequestForm && currentAnalystId !== null && (
        <AddRequestForm
          dashboards={allDashboards}
          currentAnalystId={currentAnalystId}
          onCreated={() => {
            setShowAddRequestForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddRequestForm(false)}
        />
      )}
    </div>
  );
}
