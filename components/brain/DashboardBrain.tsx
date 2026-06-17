"use client";

import { useMemo, useState } from "react";
import {
  computeDivisionWedges,
  computeDashboardPosition,
  computeRequestMoonPositions,
  Wedge,
} from "@/lib/layout-math";
import { Division, DashboardWithUrgency, DashboardStatus } from "@/lib/brain-types";

interface DashboardBrainProps {
  dashboards: DashboardWithUrgency[];
  divisions: Division[];
}

interface PositionedDashboard {
  dashboard: DashboardWithUrgency;
  x: number;
  y: number;
}

const STATUS_COLORS: Record<DashboardStatus, string> = {
  active: "#22c55e", // green-500
  maintenance: "#f59e0b", // amber-500
  retired: "#64748b", // slate-500
};

const MOON_COLLAPSE_THRESHOLD = 8;
const VIEWBOX_HALF = 450;

function daysSince(dateString: string): number {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
}

export function DashboardBrain({ dashboards, divisions }: DashboardBrainProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const wedges = useMemo(() => computeDivisionWedges(divisions), [divisions]);

  // Group dashboards by division so each gets the correct per-division
  // index/count (not a global index) when computing its position.
  const positioned = useMemo<PositionedDashboard[]>(() => {
    const byDivision = new Map<number, DashboardWithUrgency[]>();
    for (const dashboard of dashboards) {
      const group = byDivision.get(dashboard.divisionId);
      if (group) {
        group.push(dashboard);
      } else {
        byDivision.set(dashboard.divisionId, [dashboard]);
      }
    }

    const result: PositionedDashboard[] = [];
    for (const [divisionId, group] of byDivision.entries()) {
      const wedge = wedges.get(divisionId);
      if (!wedge) continue; // division not found (e.g. stale divisionId) — skip rather than crash

      group.forEach((dashboard, indexInDivision) => {
        const { x, y } = computeDashboardPosition(
          dashboard,
          wedge,
          indexInDivision,
          group.length
        );
        result.push({ dashboard, x, y });
      });
    }

    return result;
  }, [dashboards, wedges]);

  const sortedWedges = useMemo<Wedge[]>(
    () => [...wedges.values()].sort((a, b) => a.startAngle - b.startAngle),
    [wedges]
  );

  const hovered = positioned.find((p) => p.dashboard.id === hoveredId) ?? null;

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`-${VIEWBOX_HALF} -${VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`}
        className="w-full h-full max-w-[900px] max-h-[900px]"
      >
        {/* Faint wedge boundary guide lines, one per division boundary. */}
        {sortedWedges.map((wedge, i) => {
          const angleRad = (wedge.startAngle * Math.PI) / 180;
          const x2 = VIEWBOX_HALF * Math.sin(angleRad);
          const y2 = -VIEWBOX_HALF * Math.cos(angleRad);
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              className="text-slate-400 dark:text-slate-600"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
          );
        })}

        {/* Center marker — the viewing analyst. */}
        <circle cx={0} cy={0} r={10} fill="#3b82f6" stroke="white" strokeWidth={2} />

        {/* Dashboards, each with its moon dots / collapsed badge. */}
        {positioned.map(({ dashboard, x, y }) => {
          const radius = Math.max(8, Math.min(20, 4 + dashboard.openRequestCount));
          const color = STATUS_COLORS[dashboard.status] ?? STATUS_COLORS.active;
          const isHovered = hoveredId === dashboard.id;
          const showMoons =
            dashboard.openRequestCount > 0 &&
            dashboard.openRequestCount <= MOON_COLLAPSE_THRESHOLD;
          const showBadge = dashboard.openRequestCount > MOON_COLLAPSE_THRESHOLD;

          const moonPositions = showMoons
            ? computeRequestMoonPositions(x, y, dashboard.openRequestCount, radius + 10)
            : [];

          return (
            <g key={dashboard.id}>
              {showMoons &&
                moonPositions.map((moon, i) => (
                  <circle
                    key={i}
                    cx={moon.x}
                    cy={moon.y}
                    r={3}
                    fill="#94a3b8"
                    opacity={0.85}
                  />
                ))}

              {showBadge && (
                <g transform={`translate(${x + radius + 8}, ${y - radius - 8})`}>
                  <circle r={9} fill="#ef4444" />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="white"
                  >
                    {dashboard.openRequestCount}
                  </text>
                </g>
              )}

              <circle
                cx={x}
                cy={y}
                r={radius}
                fill={color}
                stroke={isHovered ? "white" : "rgba(255,255,255,0.4)"}
                strokeWidth={isHovered ? 2 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredId(dashboard.id)}
                onMouseLeave={() => setHoveredId((id) => (id === dashboard.id ? null : id))}
                onClick={() =>
                  setHoveredId((id) => (id === dashboard.id ? null : dashboard.id))
                }
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
          <p className="text-sm font-semibold text-primary">{hovered.dashboard.name}</p>
          <p className="text-xs text-secondary mt-1">
            Stakeholder: {hovered.dashboard.stakeholder ?? "—"}
          </p>
          <p className="text-xs text-secondary">
            Last touched: {daysSince(hovered.dashboard.lastTouchedDate)} days ago
          </p>
          <p className="text-xs text-secondary">
            Open requests: {hovered.dashboard.openRequestCount}
          </p>
        </div>
      )}
    </div>
  );
}
