"use client";

import { useMemo, useState } from "react";
import {
  computeDivisionWedges,
  computeEvenlySpacedPositions,
  computePositionInWedge,
} from "@/lib/layout-math";
import { bucketUrgencies } from "@/lib/urgency";
import { DashboardWithUrgency, Division, ReportSubscriptionWithUrgency } from "@/lib/brain-types";
import { BrainFilters, isStatusVisible, isUrgencyVisible } from "@/lib/filters";
import {
  DivisionPlanet,
  DIVISION_PLANET_COLOR,
} from "@/components/brain/nodes/DivisionPlanet";
import { DashboardMoon, MOON_STATUS_COLORS } from "@/components/brain/nodes/DashboardMoon";
import { ANALYST_COLOR, VIEWER_RING_COLOR } from "@/components/brain/nodes/AnalystStar";
import { DetailPanel, DetailPanelRow } from "@/components/brain/DetailPanel";
import { Legend } from "@/components/brain/Legend";

export interface DivisionNode {
  division: Division;
  radius: number; // already computed by the caller as min(...child radii) across that division's owned dashboards+subscriptions
}

interface SolarSystemViewProps {
  divisionNodes: DivisionNode[]; // already filtered by the caller to only divisions the viewed analyst owns something in
  dashboards: DashboardWithUrgency[]; // this analyst's dashboards (already scoped by useBrainData)
  subscriptions: ReportSubscriptionWithUrgency[]; // this analyst's subscriptions (already scoped by useBrainData)
  viewedAnalystId: number;
  viewerAnalystId: number | null;
  filters: BrainFilters;
  onSelectDivision: (divisionId: number) => void;
}

interface PositionedDivision {
  node: DivisionNode;
  x: number;
  y: number;
}

const VIEWBOX_HALF = 450;
const MOON_RING_RADIUS = 30; // small ring around each planet — must stay clear of inter-planet spacing, mirroring AnalystStar's DIVISION_RING_RADIUS convention
const CENTER_RADIUS = 10;
const VIEWER_CENTER_RADIUS = 12;

export function SolarSystemView({
  divisionNodes,
  dashboards,
  subscriptions,
  viewedAnalystId,
  viewerAnalystId,
  filters,
  onSelectDivision,
}: SolarSystemViewProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const divisions = useMemo(() => divisionNodes.map((n) => n.division), [divisionNodes]);
  const wedges = useMemo(() => computeDivisionWedges(divisions), [divisions]);

  const positioned = useMemo<PositionedDivision[]>(() => {
    const result: PositionedDivision[] = [];
    for (const node of divisionNodes) {
      const wedge = wedges.get(node.division.id);
      if (!wedge) continue; // division not found — skip rather than crash

      const { x, y } = computePositionInWedge(node.radius, wedge, 0, 1);
      result.push({ node, x, y });
    }
    return result;
  }, [divisionNodes, wedges]);

  // Urgency-mix bucketing: bucket across ALL of the viewed analyst's
  // dashboards+subscriptions (the full props passed in), then filter the
  // resulting buckets down to just the hovered division's items — mirrors
  // how the Galaxy zoom's highUrgencyCount was computed "globally," scoped
  // here to this analyst's system instead of the whole org.
  const urgencyBucketsById = useMemo(() => {
    const ids: { kind: "dashboard" | "subscription"; id: number; divisionId: number }[] = [];
    const scores: number[] = [];

    dashboards.forEach((d) => {
      ids.push({ kind: "dashboard", id: d.id, divisionId: d.divisionId });
      scores.push(d.urgency);
    });
    subscriptions.forEach((s) => {
      ids.push({ kind: "subscription", id: s.id, divisionId: s.divisionId });
      scores.push(s.urgency);
    });

    const buckets = bucketUrgencies(scores);
    return ids.map((entry, i) => ({ ...entry, bucket: buckets[i] }));
  }, [dashboards, subscriptions]);

  // Moons: one per dashboard/subscription, grouped by divisionId, placed on
  // a small ring around that division's planet — same technique
  // AnalystStar.tsx uses for its decorative division dots. Carries each
  // moon's status AND urgency bucket (reusing urgencyBucketsById above, the
  // same bucketing SolarSystemView already does for its hover-panel
  // "urgency mix") so the status/urgency filters can fade individual moons.
  const moonsByDivisionId = useMemo(() => {
    const bucketByKey = new Map(
      urgencyBucketsById.map((entry) => [`${entry.kind}-${entry.id}`, entry.bucket])
    );

    const map = new Map<
      number,
      { status: DashboardWithUrgency["status"]; bucket: ReturnType<typeof bucketUrgencies>[number] }[]
    >();
    const push = (
      divisionId: number,
      status: DashboardWithUrgency["status"],
      bucket: ReturnType<typeof bucketUrgencies>[number]
    ) => {
      const existing = map.get(divisionId);
      if (existing) {
        existing.push({ status, bucket });
      } else {
        map.set(divisionId, [{ status, bucket }]);
      }
    };
    dashboards.forEach((d) =>
      push(d.divisionId, d.status, bucketByKey.get(`dashboard-${d.id}`) ?? "med")
    );
    subscriptions.forEach((s) =>
      push(s.divisionId, s.status, bucketByKey.get(`subscription-${s.id}`) ?? "med")
    );
    return map;
  }, [dashboards, subscriptions, urgencyBucketsById]);

  const hovered = positioned.find((p) => p.node.division.id === hoveredId) ?? null;

  const hoveredRows = useMemo<DetailPanelRow[]>(() => {
    if (!hovered) return [];
    const divisionId = hovered.node.division.id;

    const dashboardCount = dashboards.filter((d) => d.divisionId === divisionId).length;
    const subscriptionCount = subscriptions.filter((s) => s.divisionId === divisionId).length;

    const divisionBuckets = urgencyBucketsById.filter((entry) => entry.divisionId === divisionId);
    const high = divisionBuckets.filter((e) => e.bucket === "high").length;
    const med = divisionBuckets.filter((e) => e.bucket === "med").length;
    const low = divisionBuckets.filter((e) => e.bucket === "low").length;

    return [
      { label: "Dashboards", value: dashboardCount },
      { label: "Subscriptions", value: subscriptionCount },
      { label: "Urgency mix", value: `${high} high, ${med} med, ${low} low` },
    ];
  }, [hovered, dashboards, subscriptions, urgencyBucketsById]);

  const isViewerCenter = viewedAnalystId === viewerAnalystId;

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`-${VIEWBOX_HALF} -${VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`}
        className="w-full h-full max-w-[900px] max-h-[900px]"
      >
        {/* Spokes connecting the center (the viewed analyst) to each division planet. */}
        {positioned.map(({ node, x, y }) => (
          <line
            key={node.division.id}
            x1={0}
            y1={0}
            x2={x}
            y2={y}
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-600"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ))}

        {/* Center marker — the viewed analyst. Marked distinctly with
            VIEWER_RING_COLOR when the viewed analyst is also the viewer,
            for visual consistency with the Galaxy zoom's viewer-marking
            convention. */}
        <circle
          cx={0}
          cy={0}
          r={isViewerCenter ? VIEWER_CENTER_RADIUS : CENTER_RADIUS}
          fill={ANALYST_COLOR}
          stroke={isViewerCenter ? VIEWER_RING_COLOR : "white"}
          strokeWidth={isViewerCenter ? 3 : 2}
        />

        {/* Division planets, each with a small ring of decorative moons. */}
        {positioned.map(({ node, x, y }) => {
          const moons = moonsByDivisionId.get(node.division.id) ?? [];
          const moonFadedFlags = moons.map(
            (moon) => !isStatusVisible(moon.status, filters) || !isUrgencyVisible(moon.bucket, filters)
          );
          // Planet itself fades only when EVERY moon in this division is
          // faded by the status/urgency filters (i.e. nothing here currently
          // matches) — a division with no moons at all is never faded by
          // this rule, since there's nothing to be filtered out.
          const planetFaded = moons.length > 0 && moonFadedFlags.every(Boolean);

          return (
            <g key={node.division.id}>
              {/* Moons drawn first so the planet renders on top of its own ring. */}
              {moons.map((moon, i) => {
                const pos = computeEvenlySpacedPositions(MOON_RING_RADIUS, i, moons.length);
                return (
                  <DashboardMoon
                    key={i}
                    x={x + pos.x}
                    y={y + pos.y}
                    status={moon.status}
                    isFaded={moonFadedFlags[i]}
                  />
                );
              })}

              <DivisionPlanet
                x={x}
                y={y}
                name={node.division.name}
                isHovered={hoveredId === node.division.id}
                isFaded={planetFaded}
                onHover={() => setHoveredId(node.division.id)}
                onLeave={() => setHoveredId((id) => (id === node.division.id ? null : id))}
                onClick={() => onSelectDivision(node.division.id)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && <DetailPanel title={hovered.node.division.name} rows={hoveredRows} />}

      <Legend
        items={[
          { color: DIVISION_PLANET_COLOR, label: "Division" },
          { color: MOON_STATUS_COLORS.active, label: "Dashboard (active)" },
          { color: MOON_STATUS_COLORS.maintenance, label: "Dashboard (maintenance)" },
          { color: MOON_STATUS_COLORS.retired, label: "Dashboard (retired)" },
        ]}
      />
    </div>
  );
}
