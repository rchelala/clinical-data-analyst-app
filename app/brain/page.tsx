"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ClipboardPlus, ArrowLeft, FolderPlus } from "lucide-react";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { DivisionBrain, DivisionNode } from "@/components/brain/DivisionBrain";
import { DivisionGraphBrain } from "@/components/brain/DivisionGraphBrain";
import { GalaxyCanvas } from "@/components/brain/GalaxyCanvas";
import { GalaxyView } from "@/components/brain/GalaxyView";
import { Breadcrumb } from "@/components/brain/Breadcrumb";
import { RequestSidePanel, RequestSidePanelEntity } from "@/components/brain/RequestSidePanel";
import { AddRequestForm } from "@/components/brain/AddRequestForm";
import { AddEntityForm } from "@/components/brain/AddEntityForm";
import { AddDivisionForm } from "@/components/brain/AddDivisionForm";
import { useBrainData, ZoomState } from "@/hooks/useBrainData";
import {
  Analyst,
  BrainEntityKind,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
} from "@/lib/brain-types";
import { MAX_RADIUS } from "@/lib/urgency";

interface SelectedEntity {
  kind: BrainEntityKind;
  id: number;
}

export default function BrainPage() {
  const [viewerAnalystId, setViewerAnalystId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ level: "galaxy" });

  // All dashboards/subscriptions (not scoped to the current analyst), used to
  // populate the "Add Request" dropdown per the design doc.
  const [allDashboards, setAllDashboards] = useState<DashboardWithUrgency[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | undefined>(undefined);
  const [showAddRequestForm, setShowAddRequestForm] = useState(false);
  const [showAddEntityForm, setShowAddEntityForm] = useState(false);
  const [showAddDivisionForm, setShowAddDivisionForm] = useState(false);
  // Bumping this re-runs the unscoped "all" fetch below, letting us refresh
  // urgency/counts after a new request is created.
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectAnalyst = useCallback((analystId: number) => {
    setViewerAnalystId(analystId);
  }, []);

  const brainData = useBrainData(zoom);

  // Shared fetch-and-parse logic for /api/dashboards, used by the unscoped
  // "all dashboards" fetch below.
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

  // Separate, non-blocking fetch of ALL dashboards + subscriptions + analysts
  // (no x-analyst-id header) used by the Add Request form's dropdown and by
  // the division hover tooltip's per-analyst breakdown. Doesn't gate the main
  // view. Refetches on refreshKey so breakdown counts stay current after
  // adding a dashboard/subscription/request.
  useEffect(() => {
    if (viewerAnalystId === null) return;

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
  }, [viewerAnalystId, refreshKey, fetchDashboards, fetchSubscriptions]);

  const viewedAnalystId =
    zoom.level === "analyst" || zoom.level === "division" ? zoom.analystId : null;

  // Data for the analyst/division levels, sourced from useBrainData. Empty
  // arrays when at the galaxy level (useBrainData returns galaxySummaries
  // instead).
  const divisions = "divisions" in brainData ? brainData.divisions : [];
  const dashboards = "dashboards" in brainData ? brainData.dashboards : [];
  const subscriptions = "subscriptions" in brainData ? brainData.subscriptions : [];

  // Group dashboards+subscriptions by divisionId to build the top-level
  // division nodes, each positioned at the min radius across its children.
  // A division with no dashboards/subscriptions yet is only included for the
  // analyst whose system is being viewed (parked at the outer/least-urgent
  // radius), so they can drill in and add the first dashboard — it stays
  // invisible to every other analyst until they themselves own something in
  // it. This is keyed off the VIEWED analyst, not the viewer: browsing
  // analyst X's solar system should show an empty division X created,
  // regardless of who's currently logged in as viewer.
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
      } else if (division.createdByAnalystId === viewedAnalystId) {
        nodes.push({ division, radius: MAX_RADIUS });
      }
    }
    return nodes;
  }, [dashboards, subscriptions, divisions, viewedAnalystId]);

  const selectedDivision = useMemo(
    () => (zoom.level === "division" ? divisions.find((d) => d.id === zoom.divisionId) ?? null : null),
    [zoom, divisions]
  );

  const divisionDashboards = useMemo(
    () =>
      zoom.level === "division"
        ? dashboards.filter((d) => d.divisionId === zoom.divisionId)
        : [],
    [dashboards, zoom]
  );

  const divisionSubscriptions = useMemo(
    () =>
      zoom.level === "division"
        ? subscriptions.filter((s) => s.divisionId === zoom.divisionId)
        : [],
    [subscriptions, zoom]
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

  const viewedAnalystName = useMemo(() => {
    if (viewedAnalystId === null) return null;
    return analysts.find((a) => a.id === viewedAnalystId)?.name ?? null;
  }, [analysts, viewedAnalystId]);

  const viewedDivisionName = useMemo(() => {
    if (zoom.level !== "division") return null;
    return divisions.find((d) => d.id === zoom.divisionId)?.name ?? null;
  }, [zoom, divisions]);

  const handleBackgroundClick = useCallback(() => {
    setZoom((current) => {
      if (current.level === "division") {
        return { level: "analyst", analystId: current.analystId };
      }
      if (current.level === "analyst") {
        return { level: "galaxy" };
      }
      return current;
    });
  }, []);

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
            <Breadcrumb
              zoom={zoom}
              analystName={viewedAnalystName}
              divisionName={viewedDivisionName}
              onNavigate={setZoom}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddRequestForm(true)}
            disabled={viewerAnalystId === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Request
          </button>
          <button
            onClick={() => setShowAddDivisionForm(true)}
            disabled={viewerAnalystId === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <FolderPlus className="w-3 h-3" />
            Add Division
          </button>
          <AnalystSelector onSelect={handleSelectAnalyst} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {viewerAnalystId !== null && brainData.loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <p className="text-sm text-secondary">Loading…</p>
          </div>
        )}

        {viewerAnalystId !== null && !brainData.loading && brainData.error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-600 dark:text-red-400">{brainData.error}</p>
          </div>
        )}

        {viewerAnalystId !== null && !brainData.loading && !brainData.error && zoom.level === "galaxy" && (
          <GalaxyCanvas onBackgroundClick={handleBackgroundClick}>
            <GalaxyView
              summaries={"galaxySummaries" in brainData ? brainData.galaxySummaries : []}
              viewerAnalystId={viewerAnalystId}
              onSelectAnalyst={(analystId) => setZoom({ level: "analyst", analystId })}
            />
          </GalaxyCanvas>
        )}

        {viewerAnalystId !== null &&
          !brainData.loading &&
          !brainData.error &&
          zoom.level === "analyst" &&
          !hasAnyDivisions && (
            <GalaxyCanvas onBackgroundClick={handleBackgroundClick}>
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-secondary">
                  No divisions yet — use &ldquo;Add Division&rdquo; above to create one.
                </p>
              </div>
            </GalaxyCanvas>
          )}

        {viewerAnalystId !== null &&
          !brainData.loading &&
          !brainData.error &&
          zoom.level === "analyst" &&
          hasAnyDivisions && (
            <GalaxyCanvas onBackgroundClick={handleBackgroundClick}>
              <DivisionBrain
                divisionNodes={divisionNodes}
                allDashboards={allDashboards}
                allSubscriptions={allSubscriptions}
                analysts={analysts}
                onSelectDivision={(divisionId) =>
                  setZoom({ level: "division", analystId: zoom.analystId, divisionId })
                }
              />
            </GalaxyCanvas>
          )}

        {viewerAnalystId !== null &&
          !brainData.loading &&
          !brainData.error &&
          zoom.level === "division" &&
          selectedDivision && (
            <GalaxyCanvas onBackgroundClick={handleBackgroundClick}>
              <DivisionGraphBrain
                division={selectedDivision}
                dashboards={divisionDashboards}
                subscriptions={divisionSubscriptions}
                onSelectEntity={(kind, id, focusRequestId) => {
                  setSelectedEntity({ kind, id });
                  setSelectedRequestId(focusRequestId);
                }}
                onBack={() => setZoom({ level: "analyst", analystId: zoom.analystId })}
                onAddEntity={() => setShowAddEntityForm(true)}
              />
            </GalaxyCanvas>
          )}
      </main>

      {viewerAnalystId !== null && (
        <RequestSidePanel
          entity={sidePanelEntity}
          currentAnalystId={viewerAnalystId}
          focusRequestId={selectedRequestId}
          onClose={() => {
            setSelectedEntity(null);
            setSelectedRequestId(undefined);
          }}
        />
      )}

      {showAddRequestForm && viewerAnalystId !== null && (
        <AddRequestForm
          dashboards={allDashboards}
          subscriptions={allSubscriptions}
          currentAnalystId={viewerAnalystId}
          onCreated={() => {
            setShowAddRequestForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddRequestForm(false)}
        />
      )}

      {showAddDivisionForm && viewerAnalystId !== null && (
        <AddDivisionForm
          currentAnalystId={viewerAnalystId}
          onCreated={() => {
            setShowAddDivisionForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddDivisionForm(false)}
        />
      )}

      {showAddEntityForm && viewerAnalystId !== null && selectedDivision && (
        <AddEntityForm
          division={selectedDivision}
          currentAnalystId={viewerAnalystId}
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
