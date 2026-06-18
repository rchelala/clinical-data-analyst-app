"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { buildGraphData, GraphData } from "@/lib/brain-graph";
import {
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestWithCreator,
  BrainEntityKind,
} from "@/lib/brain-types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface DivisionGraphBrainProps {
  division: Division;
  dashboards: DashboardWithUrgency[]; // already filtered by caller to just this division
  subscriptions: ReportSubscriptionWithUrgency[]; // already filtered by caller to just this division
  onSelectEntity: (kind: BrainEntityKind, id: number, focusRequestId?: number) => void;
  onBack: () => void;
  onAddSubscription?: () => void;
}

const LIGHT_BG = "#f8fafc";
const DARK_BG = "#0d1117";

export function DivisionGraphBrain({
  division,
  dashboards,
  subscriptions,
  onSelectEntity,
  onBack,
  onAddSubscription,
}: DivisionGraphBrainProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [requestsByEntity, setRequestsByEntity] = useState<Map<string, RequestWithCreator[]>>(
    new Map()
  );
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
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

  const graphData: GraphData = useMemo(
    () => buildGraphData(dashboards, subscriptions, requestsByEntity),
    [dashboards, subscriptions, requestsByEntity]
  );

  const backgroundColor = resolvedTheme === "dark" ? DARK_BG : LIGHT_BG;

  const textColor = resolvedTheme === "dark" ? "#e6edf3" : "#0f172a";

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphData["nodes"][number] & { x?: number; y?: number };
      const x = n.x ?? 0;
      const y = n.y ?? 0;

      ctx.beginPath();
      ctx.arc(x, y, n.val, 0, 2 * Math.PI, false);
      ctx.fillStyle = n.color;
      ctx.fill();

      if (n.ringColor) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = n.ringColor;
        ctx.stroke();
      }

      if (n.kind === "dashboard" || n.kind === "subscription") {
        ctx.font = `${12 / globalScale}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = textColor;
        ctx.fillText(n.label, x, y + n.val + 4);
      }
    },
    [textColor]
  );

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          All divisions
        </button>
        <h2 className="text-sm font-semibold text-primary">{division.name}</h2>
        {requestsLoading && (
          <span className="text-xs text-secondary">Loading requests…</span>
        )}
        {requestsError && (
          <span className="text-xs text-red-600 dark:text-red-400">{requestsError}</span>
        )}
        {onAddSubscription && (
          <button
            onClick={onAddSubscription}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-auto"
          >
            <ClipboardPlus className="w-3 h-3" />
            Add Subscription
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
            nodeCanvasObject={paintNode}
          />
        )}
      </div>
    </div>
  );
}
