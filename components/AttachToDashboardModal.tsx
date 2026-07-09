"use client";

import { useState, useCallback, useEffect } from "react";
import { LayoutDashboard } from "lucide-react";
import { FieldRequestEntry } from "@/lib/history";
import { Analyst, DashboardWithUrgency } from "@/lib/brain-types";
import { attachFieldRequestToDashboard } from "@/lib/field-request-attach";
import { loadAnalystId, saveAnalystId } from "@/lib/analyst-identity";

interface AttachToDashboardModalProps {
  entry: FieldRequestEntry;
  onAttached: (dashboardName: string) => void;
  onClose: () => void;
}

export function AttachToDashboardModal({
  entry,
  onAttached,
  onClose,
}: AttachToDashboardModalProps) {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [analystId, setAnalystId] = useState<string>("");
  const [dashboardId, setDashboardId] = useState<string>("");
  const [showAllDashboards, setShowAllDashboards] = useState(false);
  const [analystsLoaded, setAnalystsLoaded] = useState(false);
  const [analystsError, setAnalystsError] = useState(false);
  const [analystsLoading, setAnalystsLoading] = useState(true);
  const [dashboardsLoading, setDashboardsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = analystsLoading || dashboardsLoading;

  // Effect A: load analysts once on mount and determine the preselected analyst.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setAnalystsLoading(true);
      setError(null);
      setAnalystsError(false);
      try {
        const analystsRes = await fetch("/api/analysts");
        const analystsData = await analystsRes.json();

        if (cancelled) return;

        if (!analystsRes.ok) {
          setError(analystsData.error ?? "Could not load analysts.");
          setAnalystsError(true);
          return;
        }

        const loadedAnalysts: Analyst[] = analystsData;
        setAnalysts(loadedAnalysts);

        const storedAnalystId = loadAnalystId();
        const preselectedAnalyst =
          storedAnalystId !== null &&
          loadedAnalysts.some((a) => a.id === storedAnalystId)
            ? storedAnalystId
            : loadedAnalysts[0]?.id;
        setAnalystId(preselectedAnalyst !== undefined ? String(preselectedAnalyst) : "");
      } catch {
        if (!cancelled) {
          setError("Network error — could not reach the server.");
          setAnalystsError(true);
        }
      } finally {
        if (!cancelled) {
          setAnalystsLoading(false);
          setAnalystsLoaded(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Effect B: load dashboards, scoped to the selected analyst unless overridden.
  useEffect(() => {
    if (!analystsLoaded) return;
    if (analystsError) {
      // Analyst loading failed — don't clobber that error with a dashboard fetch.
      setDashboardsLoading(false);
      setDashboards([]);
      setDashboardId("");
      return;
    }

    let cancelled = false;

    async function load() {
      setDashboardsLoading(true);
      setDashboards([]);
      setError(null);
      try {
        const headers: HeadersInit | undefined =
          !showAllDashboards && analystId ? { "x-analyst-id": analystId } : undefined;

        const dashboardsRes = await fetch("/api/dashboards", { headers });
        const dashboardsData = await dashboardsRes.json();

        if (cancelled) return;

        if (!dashboardsRes.ok) {
          setError(dashboardsData.error ?? "Could not load dashboards.");
          return;
        }

        const loadedDashboards: DashboardWithUrgency[] = dashboardsData;
        setDashboards(loadedDashboards);

        setDashboardId((prevDashboardId) => {
          const stillExists = loadedDashboards.some(
            (d) => String(d.id) === prevDashboardId
          );
          if (stillExists) return prevDashboardId;
          return loadedDashboards[0] ? String(loadedDashboards[0].id) : "";
        });
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setDashboardsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [analystId, showAllDashboards, analystsLoaded, analystsError]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const parsedAnalystId = Number(analystId);
      const parsedDashboardId = Number(dashboardId);

      if (!Number.isFinite(parsedAnalystId) || !analystId) {
        setError("Please select who you are.");
        return;
      }
      if (!Number.isFinite(parsedDashboardId) || !dashboardId) {
        setError("Please select a dashboard.");
        return;
      }

      const dashboard = dashboards.find((d) => d.id === parsedDashboardId);

      setSubmitting(true);
      try {
        await attachFieldRequestToDashboard(entry, parsedDashboardId, parsedAnalystId);
        saveAnalystId(parsedAnalystId);
        onAttached(dashboard?.name ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not attach field request.");
      } finally {
        setSubmitting(false);
      }
    },
    [analystId, dashboardId, dashboards, entry, onAttached]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-elevated shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <LayoutDashboard className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Attach to dashboard
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Log this field request against a dashboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="analyst" className="text-xs font-medium text-secondary">
              Who are you <span className="text-red-500">*</span>
            </label>
            <select
              id="analyst"
              value={analystId}
              onChange={(e) => setAnalystId(e.target.value)}
              required
              disabled={loading}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {analysts.length === 0 && <option value="">No analysts available</option>}
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard" className="text-xs font-medium text-secondary">
              Dashboard <span className="text-red-500">*</span>
            </label>
            <select
              id="dashboard"
              value={dashboardId}
              onChange={(e) => setDashboardId(e.target.value)}
              required
              disabled={loading}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {dashboards.length === 0 && <option value="">No dashboards available</option>}
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={showAllDashboards}
                onChange={(e) => setShowAllDashboards(e.target.checked)}
                className="w-3.5 h-3.5 accent-brand-500"
              />
              Show All Dashboards
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || dashboards.length === 0 || analysts.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? "Attaching…" : "Attach"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
