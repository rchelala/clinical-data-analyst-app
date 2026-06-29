"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { buildGraphData, GraphData } from "@/lib/brain-graph";
import { bucketUrgencies } from "@/lib/urgency";
import {
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestWithCreator,
  BrainEntityKind,
  Task,
  RequestStatus,
} from "@/lib/brain-types";
import { BrainFilters, fadeOpacity, isRequestStatusVisible, isStatusVisible, isUrgencyVisible } from "@/lib/filters";
import { OtherAnalystsPanel } from "@/components/brain/OtherAnalystsPanel";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface DivisionGraphBrainProps {
  division: Division;
  dashboards: DashboardWithUrgency[]; // already filtered by caller to just this division
  subscriptions: ReportSubscriptionWithUrgency[]; // already filtered by caller to just this division
  filters: BrainFilters;
  centerLabel: string; // the VIEWED analyst's name, shown on the center node
  isViewerCenter: boolean; // true only when the viewed analyst IS the viewer
  onSelectEntity: (kind: BrainEntityKind, id: number, focusRequestId?: number) => void;
  onAddEntity?: () => void;
  viewedAnalystId: number;
  onJumpToAnalyst: (analystId: number) => void;
}

export function DivisionGraphBrain({
  division,
  dashboards,
  subscriptions,
  filters,
  centerLabel,
  isViewerCenter,
  onSelectEntity,
  onAddEntity,
  viewedAnalystId,
  onJumpToAnalyst,
}: DivisionGraphBrainProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [requestsByEntity, setRequestsByEntity] = useState<Map<string, RequestWithCreator[]>>(
    new Map()
  );
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [tasksByEntity, setTasksByEntity] = useState<Map<string, Task[]>>(new Map());
  const [hoveredNode, setHoveredNode] = useState<GraphData["nodes"][number] | null>(null);
  const { resolvedTheme } = useTheme();

  // Track container size so the graph fills the available space and resizes
  // with the window/sidebar, instead of being hardcoded to a fixed box.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch each entity's requests up front so they can render as graph nodes
  // immediately, rather than lazily on click (today's RequestSidePanel
  // behavior). Re-runs whenever the division's entity lists change.
  useEffect(() => {
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError(null);

    const entities: { kind: BrainEntityKind; id: number }[] = [
      ...dashboards.map((d) => ({ kind: "dashboard" as const, id: d.id })),
      ...subscriptions.map((s) => ({ kind: "subscription" as const, id: s.id })),
    ];

    (async () => {
      try {
        const results = await Promise.all(
          entities.map(async ({ kind, id }) => {
            const param = kind === "dashboard" ? `dashboardId=${id}` : `subscriptionId=${id}`;
            const res = await fetch(`/api/requests?${param}`);
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error ?? "Could not load requests.");
            }
            return [`${kind}-${id}`, data as RequestWithCreator[]] as const;
          })
        );

        if (cancelled) return;
        setRequestsByEntity(new Map(results));
      } catch (err) {
        if (!cancelled) {
          setRequestsError(
            err instanceof Error ? err.message : "Network error — could not reach the server."
          );
        }
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboards, subscriptions]);

  // Fetch each entity's tasks, plus the division's standalone tasks (no
  // dashboard/subscription parent), so they can render as graph nodes
  // alongside requests. Mirrors the requests effect above but degrades
  // gracefully on error rather than surfacing a blocking error banner —
  // tasks are supplementary to the requests-driven view.
  useEffect(() => {
    let cancelled = false;

    const entities: { kind: BrainEntityKind; id: number }[] = [
      ...dashboards.map((d) => ({ kind: "dashboard" as const, id: d.id })),
      ...subscriptions.map((s) => ({ kind: "subscription" as const, id: s.id })),
    ];

    (async () => {
      try {
        const entityResults = await Promise.all(
          entities.map(async ({ kind, id }) => {
            const param = kind === "dashboard" ? `dashboardId=${id}` : `subscriptionId=${id}`;
            const res = await fetch(`/api/tasks?${param}`);
            if (!res.ok) return [`${kind}-${id}`, [] as Task[]] as const;
            const data = await res.json();
            return [`${kind}-${id}`, data as Task[]] as const;
          })
        );

        const centerRes = await fetch(`/api/tasks?divisionId=${division.id}`);
        const centerTasks: Task[] = centerRes.ok ? await centerRes.json() : [];

        if (cancelled) return;
        setTasksByEntity(new Map([...entityResults, ["center", centerTasks] as const]));
      } catch {
        // Tasks are supplementary — silently skip on network error rather
        // than blocking the requests-driven graph from rendering.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboards, subscriptions, division.id]);

  const graphData: GraphData = useMemo(
    () =>
      buildGraphData(
        dashboards,
        subscriptions,
        requestsByEntity,
        tasksByEntity,
        centerLabel,
        isViewerCenter
      ),
    [dashboards, subscriptions, requestsByEntity, tasksByEntity, centerLabel, isViewerCenter]
  );

  // Urgency bucketing for THIS division's dashboards+subscriptions only,
  // same technique SolarSystemView.tsx already uses (bucketUrgencies() over
  // the entities currently in scope) — keyed by the same `${kind}-${id}`
  // node id buildGraphData() uses, so it's directly joinable against
  // graphData nodes below.
  const urgencyBucketByNodeId = useMemo(() => {
    const ids: string[] = [];
    const scores: number[] = [];
    dashboards.forEach((d) => {
      ids.push(`dashboard-${d.id}`);
      scores.push(d.urgency);
    });
    subscriptions.forEach((s) => {
      ids.push(`subscription-${s.id}`);
      scores.push(s.urgency);
    });
    const buckets = bucketUrgencies(scores);
    return new Map(ids.map((id, i) => [id, buckets[i]]));
  }, [dashboards, subscriptions]);

  // Direct id->status map (same `${kind}-${id}` node id scheme as above),
  // avoiding any need to reverse-engineer status from the node's rendered
  // ringColor.
  const statusByNodeId = useMemo(() => {
    const map = new Map<string, DashboardWithUrgency["status"]>();
    dashboards.forEach((d) => map.set(`dashboard-${d.id}`, d.status));
    subscriptions.forEach((s) => map.set(`subscription-${s.id}`, s.status));
    return map;
  }, [dashboards, subscriptions]);

  // Per-entity-node faded flag: status filter OR urgency filter excludes it.
  // analystFocus has no effect at this zoom level per spec.
  const isEntityNodeFaded = useCallback(
    (node: GraphData["nodes"][number]): boolean => {
      if (node.kind !== "dashboard" && node.kind !== "subscription") return false;
      const status = statusByNodeId.get(node.id);
      const statusVisible = status ? isStatusVisible(status, filters) : true;
      const bucket = urgencyBucketByNodeId.get(node.id);
      const urgencyVisible = bucket ? isUrgencyVisible(bucket, filters) : true;
      return !statusVisible || !urgencyVisible;
    },
    [filters, statusByNodeId, urgencyBucketByNodeId]
  );

  // Fully transparent so the page's starfield/ambient gradient (rendered
  // behind GalaxyCanvas in app/brain/page.tsx) shows through, matching every
  // other zoom level — this view no longer paints its own opaque background.
  const backgroundColor = "rgba(0,0,0,0)";

  const textColor = resolvedTheme === "dark" ? "#e6edf3" : "#0f172a";

  // Base tether color (used for entity->center links, and as the color
  // family for request->entity links, whose opacity/dash varies by status).
  const linkRgb = resolvedTheme === "dark" ? "148, 163, 184" : "71, 85, 105";
  const linkColor = `rgba(${linkRgb}, 0.55)`;
  const linkColorFaded = `rgba(${linkRgb}, 0.2)`;
  // Distinct brand-blue tether for a subscription linked to a dashboard —
  // never confused with the gray center-tether or status-colored request
  // tethers. Always rendered at full opacity, unaffected by any filter.
  const linkedEntityColor = "rgba(37, 64, 245, 0.6)";
  const LINK_DASH = [4, 3];
  const LINK_DASH_CLOSED = [1, 3];

  const LINK_DASH_BY_STATUS: Record<RequestStatus, number[] | null> = {
    open: null,
    in_progress: LINK_DASH,
    done: LINK_DASH_CLOSED,
  };

  // Applies the request-state filter's fade to a "rgba(r, g, b, a)" color
  // string's alpha channel via fadeOpacity(), layering on top of the
  // existing request-status-based link color rather than replacing it.
  const fadeRgbaAlpha = useCallback((rgba: string, faded: boolean): string => {
    const match = rgba.match(/^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/);
    if (!match) return rgba;
    const [, r, g, b, a] = match;
    return `rgba(${r.trim()}, ${g.trim()}, ${b.trim()}, ${fadeOpacity(parseFloat(a), faded, "multiplicative").toFixed(3)})`;
  }, []);

  const getLinkColor = useCallback(
    (link: any) => {
      const l = link as GraphData["links"][number];
      // Linked-entity tethers (subscription<->dashboard) always render at
      // full opacity in their own distinct color — never subject to the
      // request-state filter's fading below.
      if (l.linkedEntity) {
        return linkedEntityColor;
      }
      const base = l.requestStatus === "done" ? linkColorFaded : linkColor;
      // Request-state filter layers an additional opacity reduction on top
      // of the existing status-based color (solid/faded-by-status) — only
      // applies to request->entity tethers (requestStatus set), per spec.
      if (l.requestStatus && !isRequestStatusVisible(l.requestStatus, filters)) {
        return fadeRgbaAlpha(base, true);
      }
      return base;
    },
    [linkedEntityColor, linkColor, linkColorFaded, filters, fadeRgbaAlpha]
  );

  const getLinkDash = useCallback((link: any) => {
    const l = link as GraphData["links"][number];
    return l.requestStatus ? LINK_DASH_BY_STATUS[l.requestStatus] : null;
  }, []);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphData["nodes"][number] & { x?: number; y?: number };
      const x = n.x ?? 0;
      const y = n.y ?? 0;

      // Fading: entity (dashboard/subscription) nodes fade via status/
      // urgency filters using fadeOpacity()'s standalone convention (same
      // as AnalystStar/DashboardMoon/DivisionPlanet); request nodes fade
      // via the request-state filter using fadeOpacity()'s multiplicative
      // convention, matching the tether-fade treatment. Center node is
      // never faded.
      let opacity = 1;
      if (n.kind === "request") {
        const requestStatus = graphData.links.find(
          (l) => l.target === n.id && l.requestStatus !== undefined
        )?.requestStatus;
        const faded = requestStatus ? !isRequestStatusVisible(requestStatus, filters) : false;
        opacity = fadeOpacity(1, faded, "multiplicative");
      } else if (n.kind === "task") {
        // Tasks render small with no glow, like requests, but skip the
        // request-state fade logic for simplicity — always full opacity.
        opacity = 1;
      } else {
        opacity = fadeOpacity(1, isEntityNodeFaded(n));
      }

      ctx.save();
      ctx.globalAlpha = opacity;

      ctx.beginPath();
      if (n.kind === "task") {
        // Tasks render as a diamond (rotated square) so they're instantly
        // distinguishable from the circular request nodes and the large
        // glowing dashboard/subscription moons.
        const r = n.val + 2;
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else {
        ctx.arc(x, y, n.val, 0, 2 * Math.PI, false);
      }
      ctx.fillStyle = n.color;

      // Glow halo on primary nodes only — the center node and dashboard/
      // subscription entity nodes — mirroring the rest of the app's
      // convention of reserving glow for "primary" nodes (analyst stars,
      // division planets) and not small decorative/leaf nodes (here:
      // request and task nodes, the canvas equivalent of a "moon").
      if (n.kind === "center" || n.kind === "dashboard" || n.kind === "subscription") {
        ctx.shadowColor = n.color;
        // shadowBlur is specified in screen pixels and is NOT affected by the
        // canvas's current zoom/pan transform the way ctx.arc()'s geometry is.
        // globalScale = screen pixels per graph-space unit, so multiplying the
        // graph-space radius (n.val) by it converts the blur into screen-pixel
        // terms, keeping the glow visually proportional to the node at any zoom.
        ctx.shadowBlur = n.val * globalScale;
      }
      ctx.fill();
      // Reset before the ring stroke below, so the status ring doesn't inherit the glow.
      ctx.shadowBlur = 0;

      if (n.ringColor) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = n.ringColor;
        ctx.stroke();
      } else if (n.kind === "task") {
        // Crisp outline on the task diamond for extra definition against tethers.
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#0d9488"; // teal-600
        ctx.stroke();
      }

      ctx.restore();

      const isHovered = hoveredNode?.id === n.id;
      if ((n.kind === "dashboard" || n.kind === "subscription") && isHovered) {
        const fontSize = Math.max(8, Math.min(16, 12 / globalScale));
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = textColor;
        ctx.fillText(n.label, x, y + n.val + 4);
      }
    },
    [textColor, hoveredNode, isEntityNodeFaded, filters, graphData.links]
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const n = node as GraphData["nodes"][number];
      if (n.kind === "center" || !n.entityKind || n.entityId === undefined) return;
      onSelectEntity(n.entityKind, n.entityId, n.requestId);
    },
    [onSelectEntity]
  );

  const handleNodeHover = useCallback((node: any) => {
    const n = node as GraphData["nodes"][number] | null;
    setHoveredNode(n && (n.kind === "dashboard" || n.kind === "subscription") ? n : null);
  }, []);

  function daysSince(dateString: string): number {
    return Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0">
        <h2 className="text-sm font-semibold text-primary">{division.name}</h2>
        {requestsLoading && (
          <span className="text-xs text-secondary">Loading requests…</span>
        )}
        {requestsError && (
          <span className="text-xs text-red-600 dark:text-red-400">{requestsError}</span>
        )}
        {onAddEntity && (
          <button
            onClick={onAddEntity}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-auto"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Dashboard / Subscription
          </button>
        )}
      </div>

      <div ref={containerRef} className="relative flex-1">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={backgroundColor}
            nodeId="id"
            nodeVal="val"
            linkColor={getLinkColor}
            linkLineDash={getLinkDash}
            linkWidth={1.5}
            nodeCanvasObject={paintNode}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            nodeLabel={(node: any) => {
              const n = node as GraphData["nodes"][number];
              if (n.kind === "task") {
                // Show the assignee in the tooltip so it's clear who owns a
                // task, especially one on a dashboard you don't own / when
                // viewing another analyst's galaxy.
                const escapeHtml = (s: string) =>
                  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const owner = n.taskOwnerName
                  ? `<div style="opacity:0.7;margin-top:2px">Assigned to ${escapeHtml(n.taskOwnerName)}</div>`
                  : "";
                return `<div>${escapeHtml(n.label)}${owner}</div>`;
              }
              return n.kind === "request" ? n.label : "";
            }}
          />
        )}
        {hoveredNode && (
          <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
            <p className="text-sm font-semibold text-primary">{hoveredNode.label}</p>
            <p className="text-xs text-secondary mt-1">
              Stakeholder: {hoveredNode.stakeholder ?? "—"}
            </p>
            {hoveredNode.lastTouchedDate && (
              <p className="text-xs text-secondary">
                Last touched: {daysSince(hoveredNode.lastTouchedDate)} days ago
              </p>
            )}
            <p className="text-xs text-secondary">
              Open requests: {(hoveredNode.openRequestCount ?? 0) - (hoveredNode.inProgressRequestCount ?? 0)}
            </p>
            <p className="text-xs text-secondary">
              In progress: {hoveredNode.inProgressRequestCount ?? 0}
            </p>
          </div>
        )}

        <OtherAnalystsPanel
          divisionId={division.id}
          excludeAnalystId={viewedAnalystId}
          onJumpToAnalyst={onJumpToAnalyst}
        />

        <div className="absolute bottom-4 right-4 rounded-lg border border-theme bg-panel shadow-lg px-3 py-2.5 pointer-events-none">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">Legend</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#94a3b8" }} />
              Request
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span className="w-2 h-2 rotate-45 flex-shrink-0" style={{ backgroundColor: "#2dd4bf" }} />
              Task (diamond)
            </div>
          </div>
          <div className="border-t border-theme my-1.5" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2"
                style={{ borderColor: "#22c55e" }}
              />
              Active
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2"
                style={{ borderColor: "#f59e0b" }}
              />
              Maintenance
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2"
                style={{ borderColor: "#64748b" }}
              />
              Retired
            </div>
          </div>
          <div className="border-t border-theme my-1.5" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <svg width="16" height="10" className="flex-shrink-0">
                <line x1="0" y1="5" x2="16" y2="5" stroke={linkColor} strokeWidth="1.5" />
              </svg>
              Open
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <svg width="16" height="10" className="flex-shrink-0">
                <line x1="0" y1="5" x2="16" y2="5" stroke={linkColor} strokeWidth="1.5" strokeDasharray={LINK_DASH.join(" ")} />
              </svg>
              In progress
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <svg width="16" height="10" className="flex-shrink-0">
                <line x1="0" y1="5" x2="16" y2="5" stroke={linkColorFaded} strokeWidth="1.5" strokeDasharray={LINK_DASH_CLOSED.join(" ")} />
              </svg>
              Closed
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <svg width="16" height="10" className="flex-shrink-0">
                <line x1="0" y1="5" x2="16" y2="5" stroke={linkedEntityColor} strokeWidth="1.5" />
              </svg>
              Linked dashboard ↔ subscription
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
