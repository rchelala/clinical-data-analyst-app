"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ClipboardPlus, ArrowLeft, Home, FolderPlus, ClipboardList, ListTodo, HelpCircle, Trash2, Inbox, Building2 } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { UrgencyInfoModal } from "@/components/brain/UrgencyInfoModal";
import { SolarSystemView, DivisionNode } from "@/components/brain/SolarSystemView";
import { PlanetView } from "@/components/brain/PlanetView";
import { GalaxyCanvas } from "@/components/brain/GalaxyCanvas";
import { GalaxyView } from "@/components/brain/GalaxyView";
import { Breadcrumb } from "@/components/brain/Breadcrumb";
import { RequestSidePanel, RequestSidePanelEntity } from "@/components/brain/RequestSidePanel";
import { DivisionTasksPanel } from "@/components/brain/DivisionTasksPanel";
import { AddRequestForm } from "@/components/brain/AddRequestForm";
import { AddEntityForm } from "@/components/brain/AddEntityForm";
import { AddDivisionForm } from "@/components/brain/AddDivisionForm";
import { DeleteDivisionModal } from "@/components/brain/DeleteDivisionModal";
import { FilterRail } from "@/components/brain/FilterRail";
import { useBrainData, ZoomState } from "@/hooks/useBrainData";
import {
  Analyst,
  BrainEntityKind,
  DashboardWithUrgency,
  Division,
  ReportSubscriptionWithUrgency,
} from "@/lib/brain-types";
import { MAX_RADIUS } from "@/lib/urgency";
import { BrainFilters, createDefaultFilters } from "@/lib/filters";
import { resolveSearchResults, SearchResult } from "@/lib/brain-search";

interface SelectedEntity {
  kind: BrainEntityKind;
  id: number;
}

// Resolves a subscription's linkedDashboardId to the {id, name} shape the
// side panel needs, looking the dashboard up in the unscoped "all" list so
// this keeps working regardless of the current zoom's scoped data.
function findLinkedDashboard(
  linkedDashboardId: number | null,
  allDashboards: DashboardWithUrgency[]
): { id: number; name: string } | null {
  if (linkedDashboardId === null) return null;
  const dashboard = allDashboards.find((d) => d.id === linkedDashboardId);
  return dashboard ? { id: dashboard.id, name: dashboard.name } : null;
}

export default function BrainPage() {
  const [viewerAnalystId, setViewerAnalystId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ level: "galaxy" });

  // All dashboards/subscriptions (not scoped to the current analyst), used to
  // populate the "Add Request" dropdown per the design doc.
  const [allDashboards, setAllDashboards] = useState<DashboardWithUrgency[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  // All divisions (org-wide, not scoped to any one analyst) — used by the
  // FilterRail search typeahead to match against division names.
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | undefined>(undefined);
  const [showAddRequestForm, setShowAddRequestForm] = useState(false);
  const [showAddEntityForm, setShowAddEntityForm] = useState(false);
  const [showAddDivisionForm, setShowAddDivisionForm] = useState(false);
  const [showDivisionTasks, setShowDivisionTasks] = useState(false);
  const [showDeleteDivision, setShowDeleteDivision] = useState(false);
  const [showUrgencyInfo, setShowUrgencyInfo] = useState(false);
  // Bumping this re-runs the unscoped "all" fetch below, letting us refresh
  // urgency/counts after a new request is created.
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState<BrainFilters>(createDefaultFilters());
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectAnalyst = useCallback(
    (analystId: number, _analystName: string, isManualSwitch: boolean) => {
      setViewerAnalystId(analystId);
      // Only navigate on a deliberate pick (clicking a name in the
      // selector modal) — the silent on-mount restore of a previously
      // stored identity must leave `zoom` alone so returning users still
      // land on the Galaxy overview, not get auto-navigated into their
      // own system.
      if (isManualSwitch) {
        setZoom({ level: "analyst", analystId });
      }
    },
    []
  );

  const brainData = useBrainData(zoom, refreshKey);

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
        const [dashboardsData, subscriptionsData, analystsRes, divisionsRes] = await Promise.all([
          fetchDashboards(),
          fetchSubscriptions(),
          fetch("/api/analysts"),
          fetch("/api/divisions"),
        ]);
        if (cancelled) return;

        setAllDashboards(dashboardsData);
        setAllSubscriptions(subscriptionsData);

        const analystsData = await analystsRes.json();
        if (!cancelled && analystsRes.ok) {
          setAnalysts(analystsData);
        }

        const divisionsData = await divisionsRes.json();
        if (!cancelled && divisionsRes.ok) {
          setAllDivisions(divisionsData);
        }
      } catch {
        // Non-critical for the main view; dependent UI (Add Request dropdown,
        // hover breakdown, search) will simply show as empty if this fails.
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
        status: dashboard.status,
        manualUrgency: dashboard.manualUrgency,
        jiraTicketId: dashboard.jiraTicketId,
        divisionId: dashboard.divisionId,
        analystId: dashboard.analystId,
        linkedDashboard: null,
        linkedSubscriptions: allSubscriptions
          .filter((s) => s.linkedDashboardId === dashboard.id)
          .map((s) => ({ id: s.id, name: s.name })),
      };
    }

    const subscription = subscriptions.find((s) => s.id === selectedEntity.id);
    if (!subscription) return null;
    return {
      kind: "subscription",
      id: subscription.id,
      name: subscription.name,
      stakeholder: subscription.stakeholder,
      status: subscription.status,
      manualUrgency: subscription.manualUrgency,
      jiraTicketId: subscription.jiraTicketId,
      divisionId: subscription.divisionId,
      analystId: subscription.analystId,
      linkedDashboard: findLinkedDashboard(subscription.linkedDashboardId, allDashboards),
      linkedSubscriptions: [],
    };
  }, [selectedEntity, dashboards, subscriptions, allDashboards, allSubscriptions]);

  // Dashboards available to link/show in the side panel, scoped to whichever
  // division the side panel's CURRENT entity belongs to — not necessarily the
  // same division as the currently-zoomed view.
  const sidePanelDashboardsInDivision = useMemo(
    () =>
      sidePanelEntity
        ? allDashboards
            .filter((d) => d.divisionId === sidePanelEntity.divisionId)
            .map((d) => ({ id: d.id, name: d.name }))
        : [],
    [sidePanelEntity, allDashboards]
  );

  const hasAnyDivisions = divisionNodes.length > 0;

  // Search typeahead results, resolved against the unscoped "all" data
  // (dashboards/subscriptions/divisions/analysts) fetched above. Recomputes
  // whenever the query or any of that underlying data changes.
  const searchResults = useMemo<SearchResult[]>(
    () =>
      resolveSearchResults(searchQuery, {
        allDashboards,
        allSubscriptions,
        allDivisions,
        analysts,
        viewerAnalystId,
      }),
    [searchQuery, allDashboards, allSubscriptions, allDivisions, analysts, viewerAnalystId]
  );

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    setZoom(result.targetZoom);
    setSearchQuery("");
  }, []);

  const viewedAnalystName = useMemo(() => {
    if (viewedAnalystId === null) return null;
    return analysts.find((a) => a.id === viewedAnalystId)?.name ?? null;
  }, [analysts, viewedAnalystId]);

  const viewedDivisionName = useMemo(() => {
    if (zoom.level !== "division") return null;
    return divisions.find((d) => d.id === zoom.divisionId)?.name ?? null;
  }, [zoom, divisions]);

  // Zooms out exactly one level (division -> analyst -> galaxy; no-op at
  // galaxy). Shared by the explicit "Back" button in the header and by
  // GalaxyCanvas's onBackgroundClick (clicking empty canvas), so there's a
  // single source of truth for "what's one level up from here."
  const handleZoomOut = useCallback(() => {
    setShowDivisionTasks(false);
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

  // Depth/identity of the currently rendered zoom target, passed to every
  // GalaxyCanvas instance below so it can play its "flying into"/"pulling
  // back from" transition (GALAXY_VIEW_SPEC.md section 7) whenever the
  // target changes. zoomKey intentionally omits viewerAnalystId/loading/error
  // state — it should only change when the rendered zoom target itself
  // changes, not on every unrelated re-render.
  const zoomDepth = zoom.level === "galaxy" ? 0 : zoom.level === "analyst" ? 1 : 2;
  const zoomKey = `${zoom.level}-${"analystId" in zoom ? zoom.analystId : ""}-${
    "divisionId" in zoom ? zoom.divisionId : ""
  }`;

  // Shared props for every GalaxyCanvas instance below, so the 4 render
  // branches don't each repeat the same three identical props.
  const canvasProps = { onBackgroundClick: handleZoomOut, zoomDepth, zoomKey };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary">
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />

      <header className="flex items-center justify-between flex-wrap md:flex-nowrap px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
        {/* Mobile nav bar (below md) */}
        <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-theme bg-primary-glass flex-shrink-0 w-full">
          <MobileNav active="brain" />
          <span className="text-sm font-medium text-primary">Brain</span>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            <Home className="w-3 h-3" />
            Home
          </Link>
          <Link
            href="/worklist"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            <ClipboardList className="w-3 h-3" />
            Worklist
          </Link>
          <Link
            href="/overview"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            <Building2 className="w-3 h-3" />
            Overview
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
          <button
            onClick={handleZoomOut}
            disabled={zoom.level === "galaxy"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>
          {zoom.level === "division" && selectedDivision && (
            <button
              onClick={() => setShowDivisionTasks(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
            >
              <ListTodo className="w-3 h-3" />
              Division Tasks
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 gap-y-2 flex-wrap md:flex-nowrap max-w-full">
          <button
            onClick={() => setShowAddRequestForm(true)}
            disabled={viewerAnalystId === null}
            className="btn-shimmer flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Request
          </button>
          <button
            onClick={() => setShowAddDivisionForm(true)}
            disabled={viewerAnalystId === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60"
          >
            <FolderPlus className="w-3 h-3" />
            Add Division
          </button>
          <Link
            href="/brain/unassigned"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            <Inbox className="w-3 h-3" />
            Unassigned
          </Link>
          {zoom.level === "division" && selectedDivision && (
            <button
              onClick={() => setShowDeleteDivision(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60"
            >
              <Trash2 className="w-3 h-3" />
              Delete Division
            </button>
          )}
          <AnalystSelector onSelect={handleSelectAnalyst} />
          <button
            onClick={() => setShowUrgencyInfo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
            How distance works
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-row">
        {viewerAnalystId !== null && (
          <FilterRail
            filters={filters}
            onFiltersChange={setFilters}
            analysts={analysts}
            showAnalystFocus={zoom.level === "galaxy"}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchResults={searchResults}
            onSelectSearchResult={handleSelectSearchResult}
          />
        )}

        <div className="relative flex-1 overflow-hidden">
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
            <GalaxyCanvas {...canvasProps}>
              <GalaxyView
                summaries={"galaxySummaries" in brainData ? brainData.galaxySummaries : []}
                viewerAnalystId={viewerAnalystId}
                filters={filters}
                onSelectAnalyst={(analystId) => setZoom({ level: "analyst", analystId })}
              />
            </GalaxyCanvas>
          )}

          {viewerAnalystId !== null &&
            !brainData.loading &&
            !brainData.error &&
            zoom.level === "analyst" &&
            !hasAnyDivisions && (
              <GalaxyCanvas {...canvasProps}>
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
              <GalaxyCanvas {...canvasProps}>
                <SolarSystemView
                  divisionNodes={divisionNodes}
                  dashboards={dashboards}
                  subscriptions={subscriptions}
                  viewedAnalystId={zoom.analystId}
                  viewerAnalystId={viewerAnalystId}
                  filters={filters}
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
              <GalaxyCanvas {...canvasProps}>
                <PlanetView
                  division={selectedDivision}
                  dashboards={divisionDashboards}
                  subscriptions={divisionSubscriptions}
                  filters={filters}
                  centerLabel={viewedAnalystName ?? ""}
                  isViewerCenter={zoom.level === "division" && zoom.analystId === viewerAnalystId}
                  onSelectEntity={(kind, id, focusRequestId) => {
                    setSelectedEntity({ kind, id });
                    setSelectedRequestId(focusRequestId);
                  }}
                  onAddEntity={() => setShowAddEntityForm(true)}
                  viewedAnalystId={zoom.analystId}
                  onJumpToAnalyst={(otherAnalystId) =>
                    setZoom({ level: "division", analystId: otherAnalystId, divisionId: selectedDivision.id })
                  }
                />
              </GalaxyCanvas>
            )}
        </div>
      </main>

      {viewerAnalystId !== null && (
        <RequestSidePanel
          entity={sidePanelEntity}
          currentAnalystId={viewerAnalystId}
          focusRequestId={selectedRequestId}
          divisions={allDivisions}
          dashboardsInDivision={sidePanelDashboardsInDivision}
          onClose={() => {
            setSelectedEntity(null);
            setSelectedRequestId(undefined);
          }}
          onEntityDeleted={() => {
            setSelectedEntity(null);
            setSelectedRequestId(undefined);
            setRefreshKey((k) => k + 1);
          }}
          onNavigateToEntity={(kind, id) => {
            setSelectedEntity({ kind, id });
            setSelectedRequestId(undefined);
          }}
          onEntityUpdated={(newIdentity) => {
            // Follow the entity to its new kind/id. sidePanelEntity briefly
            // resolves to null until the refreshKey-triggered refetch below
            // picks up the entity under its new identity, so the panel
            // flickers closed/reopen rather than ever showing stale data
            // against the new id. Do not "fix" the flicker by falling back
            // to the previous sidePanelEntity value instead of null — that
            // would reintroduce a real race where the old entity's data is
            // shown mislabeled under the new id.
            setSelectedEntity(newIdentity);
            setRefreshKey((k) => k + 1);
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
          dashboardsInDivision={divisionDashboards.map((d) => ({ id: d.id, name: d.name }))}
          onCreated={() => {
            setShowAddEntityForm(false);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowAddEntityForm(false)}
        />
      )}

      {showDivisionTasks && selectedDivision && (
        <DivisionTasksPanel
          divisionId={selectedDivision.id}
          divisionName={selectedDivision.name}
          onClose={() => setShowDivisionTasks(false)}
        />
      )}

      {showDeleteDivision && zoom.level === "division" && selectedDivision && (
        <DeleteDivisionModal
          division={selectedDivision}
          dashboardCount={divisionDashboards.length}
          subscriptionCount={divisionSubscriptions.length}
          onDeleted={() => {
            setShowDeleteDivision(false);
            handleZoomOut();
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setShowDeleteDivision(false)}
        />
      )}

      {showUrgencyInfo && <UrgencyInfoModal onClose={() => setShowUrgencyInfo(false)} />}
    </div>
  );
}
