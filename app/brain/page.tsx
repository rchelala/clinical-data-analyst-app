"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ClipboardPlus, ArrowLeft, FolderPlus } from "lucide-react";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { DivisionBrain, DivisionNode } from "@/components/brain/DivisionBrain";
import { DivisionGraphBrain } from "@/components/brain/DivisionGraphBrain";
import { RequestSidePanel, RequestSidePanelEntity } from "@/components/brain/RequestSidePanel";
import { AddRequestForm } from "@/components/brain/AddRequestForm";
import { AddEntityForm } from "@/components/brain/AddEntityForm";
import { AddDivisionForm } from "@/components/brain/AddDivisionForm";
import {
  Analyst,
  BrainEntityKind,
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
} from "@/lib/brain-types";
import { MAX_RADIUS } from "@/lib/urgency";

interface SelectedEntity {
  kind: BrainEntityKind;
  id: number;
}

export default function BrainPage() {
  const [currentAnalystId, setCurrentAnalystId] = useState<number | null>(null);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [subscriptions, setSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // All dashboards/subscriptions (not scoped to the current analyst), used to
  // populate the "Add Request" dropdown per the design doc.
  const [allDashboards, setAllDashboards] = useState<DashboardWithUrgency[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | undefined>(undefined);
  const [showAddRequestForm, setShowAddRequestForm] = useState(false);
  const [showAddEntityForm, setShowAddEntityForm] = useState(false);
  const [showAddDivisionForm, setShowAddDivisionForm] = useState(false);
  // Bumping this re-runs the dashboards/subscriptions-fetching effect below,
  // letting us refresh urgency/counts after a new request is created.
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentAnalystName, setCurrentAnalystName] = useState<string>("");

  const handleSelectAnalyst = useCallback((analystId: number, analystName: string) => {
    setCurrentAnalystId(analystId);
    setCurrentAnalystName(analystName);
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

  // Mirror of fetchDashboards for /api/report-subscriptions.
  const fetchSubscriptions = useCallback(
    async (headers?: HeadersInit): Promise<ReportSubscriptionWithUrgency[]> => {
      const res = await fetch("/api/report-subscriptions", headers ? { headers } : undefined);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not load report subscriptions.");
      }
      return data;
    },
    []
  );

  // One-time, unscoped division list — not analyst-specific, so it doesn't
  // need to refetch on analyst switch or refreshKey bumps.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/divisions");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load divisions.");
          return;
        }
        setDivisions(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error — could not reach the server.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Main effect: fetch analyst-scoped dashboards + subscriptions.
  useEffect(() => {
    if (currentAnalystId === null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [dashboardsData, subscriptionsData] = await Promise.all([
          fetchDashboards({ "x-analyst-id": String(currentAnalystId) }),
          fetchSubscriptions({ "x-analyst-id": String(currentAnalystId) }),
        ]);

        if (cancelled) return;

        setDashboards(dashboardsData);
        setSubscriptions(subscriptionsData);
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
  }, [currentAnalystId, refreshKey, fetchDashboards, fetchSubscriptions]);

  // Separate, non-blocking fetch of ALL dashboards + subscriptions + analysts
  // (no x-analyst-id header) used by the Add Request form's dropdown and by
  // the division hover tooltip's per-analyst breakdown. Doesn't gate the main
  // view. Refetches on refreshKey so breakdown counts stay current after
  // adding a dashboard/subscription/request.
  useEffect(() => {
    if (currentAnalystId === null) return;

    let cancelled = false;

    (async () => {
      try {
        const [dashboardsData, subscriptionsData, analystsRes] = await Promise.all([
          fetchDashboards(),
          fetchSubscriptions(),
          fetch("/api/analysts"),
        ]);
        if (cancelled) return;

        setAllDashboards(dashboardsData);
        setAllSubscriptions(subscriptionsData);

        const analystsData = await analystsRes.json();
        if (!cancelled && analystsRes.ok) {
          setAnalysts(analystsData);
        }
      } catch {
        // Non-critical for the main view; dependent UI (Add Request dropdown,
        // hover breakdown) will simply show as empty if this fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAnalystId, refreshKey, fetchDashboards, fetchSubscriptions]);

  // Group dashboards+subscriptions by divisionId to build the top-level
  // division nodes, each positioned at the min radius across its children.
  // A division with no dashboards/subscriptions yet is only included for the
  // analyst who created it (parked at the outer/least-urgent radius), so they
  // can drill in and add the first dashboard — it stays invisible to every
  // other analyst until they themselves own something in it.
  const divisionNodes = useMemo<DivisionNode[]>(() => {
    const radiiByDivision = new Map<number, number[]>();

    const addRadius = (divisionId: number, radius: number) => {
      const existing = radiiByDivision.get(divisionId);
      if (existing) {
        existing.push(radius);
      } else {
        radiiByDivision.set(divisionId, [radius]);
      }
    };

    dashboards.forEach((d) => addRadius(d.divisionId, d.radius));
    subscriptions.forEach((s) => addRadius(s.divisionId, s.radius));

    const nodes: DivisionNode[] = [];
    for (const division of divisions) {
      const radii = radiiByDivision.get(division.id);
      if (radii) {
        nodes.push({ division, radius: Math.min(...radii) });
      } else if (division.createdByAnalystId === currentAnalystId) {
        nodes.push({ division, radius: MAX_RADIUS });
      }
    }
    return nodes;
  }, [dashboards, subscriptions, divisions, currentAnalystId]);

  const selectedDivision = useMemo(
    () => (selectedDivisionId !== null ? divisions.find((d) => d.id === selectedDivisionId) ?? null : null),
    [selectedDivisionId, divisions]
  );

  const divisionDashboards = useMemo(
    () => dashboards.filter((d) => d.divisionId === selectedDivisionId),
    [dashboards, selectedDivisionId]
  );

  const divisionSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.divisionId === selectedDivisionId),
    [subscriptions, selectedDivisionId]
  );

  const sidePanelEntity = useMemo<RequestSidePanelEntity | null>(() => {
    if (!selectedEntity) return null;

    if (selectedEntity.kind === "dashboard") {
      const dashboard = dashboards.find((d) => d.id === selectedEntity.id);
      if (!dashboard) return null;
      return {
        kind: "dashboard",
        id: dashboard.id,
        name: dashboard.name,
        stakeholder: dashboard.stakeholder,
      };
    }

    const subscription = subscriptions.find((s) => s.id === selectedEntity.id);
    if (!subscription) return null;
    return {
      kind: "subscription",
      id: subscription.id,
      name: subscription.name,
      stakeholder: subscription.stakeholder,
    };
  }, [selectedEntity, dashboards, subscriptions]);

  const hasAnyDivisions = divisionNodes.length > 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Home
          </Link>
          <div>
            <h1 className="text-base font-semibold text-primary leading-none">
              Dashboard Brain
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              {currentAnalystName ? `Viewing ${currentAnalystName}'s dashboards` : "Your dashboards, orbiting by urgency"}
            </p>
          </div>
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
          <button
            onClick={() => setShowAddDivisionForm(true)}
            disabled={currentAnalystId === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <FolderPlus className="w-3 h-3" />
            Add Division
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

        {currentAnalystId !== null && !loading && !error && !hasAnyDivisions && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-secondary">
              No divisions yet — use &ldquo;Add Division&rdquo; above to create one.
            </p>
          </div>
        )}

        {currentAnalystId !== null && !loading && !error && hasAnyDivisions && selectedDivisionId === null && (
          <DivisionBrain
            divisionNodes={divisionNodes}
            allDashboards={allDashboards}
            allSubscriptions={allSubscriptions}
            analysts={analysts}
            onSelectDivision={setSelectedDivisionId}
          />
        )}

        {currentAnalystId !== null && !loading && !error && hasAnyDivisions && selectedDivision && (
          <DivisionGraphBrain
            division={selectedDivision}
            dashboards={divisionDashboards}
            subscriptions={divisionSubscriptions}
            onSelectEntity={(kind, id, focusRequestId) => {
              setSelectedEntity({ kind, id });
              setSelectedRequestId(focusRequestId);
            }}
            onBack={() => setSelectedDivisionId(null)}
            onAddEntity={() => setShowAddEntityForm(true)}
          />
        )}
      </main>

      {currentAnalystId !== null && (
        <RequestSidePanel
          entity={sidePanelEntity}
          currentAnalystId={currentAnalystId}
          focusRequestId={selectedRequestId}
          onClose={() => {
            setSelectedEntity(null);
            setSelectedRequestId(undefined);
          }}
        />
      )}

      {showAddRequestForm && currentAnalystId !== null && (
        <AddRequestForm
          dashboards={allDashboards}
          subscriptions={allSubscriptions}
          currentAnalystId={currentAnalystId}
          onCreated={() => {
            setShowAddRequestForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddRequestForm(false)}
        />
      )}

      {showAddDivisionForm && currentAnalystId !== null && (
        <AddDivisionForm
          currentAnalystId={currentAnalystId}
          onCreated={(division) => {
            setDivisions((prev) => [...prev, division]);
            setShowAddDivisionForm(false);
          }}
          onCancel={() => setShowAddDivisionForm(false)}
        />
      )}

      {showAddEntityForm && currentAnalystId !== null && selectedDivision && (
        <AddEntityForm
          division={selectedDivision}
          currentAnalystId={currentAnalystId}
          onCreated={() => {
            setShowAddEntityForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddEntityForm(false)}
        />
      )}
    </div>
  );
}
