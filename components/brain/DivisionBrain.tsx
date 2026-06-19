"use client";

import { useMemo, useState } from "react";
import { computeDivisionWedges, computePositionInWedge } from "@/lib/layout-math";
import { Analyst, DashboardWithUrgency, Division, ReportSubscriptionWithUrgency } from "@/lib/brain-types";

export interface DivisionNode {
  division: Division;
  radius: number; // already computed by the caller as min(...child radii) across that division's owned dashboards+subscriptions
}

interface DivisionBrainProps {
  divisionNodes: DivisionNode[]; // already filtered by the caller to only divisions the current analyst owns something in
  allDashboards: DashboardWithUrgency[]; // unscoped — every analyst's dashboards, for the hover breakdown
  allSubscriptions: ReportSubscriptionWithUrgency[]; // unscoped — every analyst's subscriptions, for the hover breakdown
  analysts: Analyst[];
  onSelectDivision: (divisionId: number) => void;
}

interface AnalystBreakdownRow {
  analystName: string;
  dashboardCount: number;
  subscriptionCount: number;
}

interface PositionedDivision {
  node: DivisionNode;
  x: number;
  y: number;
}

const VIEWBOX_HALF = 450;
const DIVISION_DOT_RADIUS = 18;
const MAX_LABEL_LENGTH = 16;

// Long names collide with their neighbors when wedges are narrow (many
// divisions). Truncating keeps labels readable; the full name is still
// shown in the hover card.
function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_LENGTH
    ? `${name.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : name;
}

export function DivisionBrain({
  divisionNodes,
  allDashboards,
  allSubscriptions,
  analysts,
  onSelectDivision,
}: DivisionBrainProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const analystNameById = useMemo(() => {
    const map = new Map<number, string>();
    analysts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [analysts]);

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

  const hovered = positioned.find((p) => p.node.division.id === hoveredId) ?? null;

  const hoveredBreakdown = useMemo<AnalystBreakdownRow[]>(() => {
    if (!hovered) return [];

    const countsByAnalystId = new Map<number | null, { dashboardCount: number; subscriptionCount: number }>();
    const bump = (analystId: number | null, key: "dashboardCount" | "subscriptionCount") => {
      const existing = countsByAnalystId.get(analystId) ?? { dashboardCount: 0, subscriptionCount: 0 };
      existing[key] += 1;
      countsByAnalystId.set(analystId, existing);
    };

    allDashboards
      .filter((d) => d.divisionId === hovered.node.division.id)
      .forEach((d) => bump(d.analystId, "dashboardCount"));
    allSubscriptions
      .filter((s) => s.divisionId === hovered.node.division.id)
      .forEach((s) => bump(s.analystId, "subscriptionCount"));

    return [...countsByAnalystId.entries()]
      .map(([analystId, counts]) => ({
        analystName: analystId !== null ? analystNameById.get(analystId) ?? "Unknown" : "Unassigned",
        ...counts,
      }))
      .sort((a, b) => b.dashboardCount + b.subscriptionCount - (a.dashboardCount + a.subscriptionCount));
  }, [hovered, allDashboards, allSubscriptions, analystNameById]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`-${VIEWBOX_HALF} -${VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`}
        className="w-full h-full max-w-[900px] max-h-[900px]"
      >
        {/* Spokes connecting the center (the viewing analyst) to each division dot. */}
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

        {/* Center marker — the viewing analyst. */}
        <circle cx={0} cy={0} r={10} fill="#3b82f6" stroke="white" strokeWidth={2} />

        {/* Division nodes. */}
        {positioned.map(({ node, x, y }) => {
          const isHovered = hoveredId === node.division.id;

          return (
            <g key={node.division.id}>
              <circle
                cx={x}
                cy={y}
                r={DIVISION_DOT_RADIUS}
                fill="#6366f1"
                stroke={isHovered ? "white" : "rgba(255,255,255,0.4)"}
                strokeWidth={isHovered ? 2 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredId(node.division.id)}
                onMouseLeave={() =>
                  setHoveredId((id) => (id === node.division.id ? null : id))
                }
                onClick={() => onSelectDivision(node.division.id)}
              />
              <text
                x={x}
                y={y + DIVISION_DOT_RADIUS + 16}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="currentColor"
                className="text-primary"
                style={{ pointerEvents: "none" }}
              >
                {truncateLabel(node.division.name)}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
          <p className="text-sm font-semibold text-primary">{hovered.node.division.name}</p>
          {hoveredBreakdown.length === 0 ? (
            <p className="text-xs text-secondary mt-1">No dashboards or subscriptions yet.</p>
          ) : (
            <table className="text-xs text-secondary mt-2 w-full">
              <thead>
                <tr className="text-left">
                  <th className="font-medium pr-3 pb-1">Analyst</th>
                  <th className="font-medium pr-3 pb-1 text-right">Dash.</th>
                  <th className="font-medium pb-1 text-right">Subs.</th>
                </tr>
              </thead>
              <tbody>
                {hoveredBreakdown.map((row) => (
                  <tr key={row.analystName}>
                    <td className="pr-3 py-0.5 text-primary">{row.analystName}</td>
                    <td className="pr-3 py-0.5 text-right">{row.dashboardCount}</td>
                    <td className="py-0.5 text-right">{row.subscriptionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="absolute bottom-4 right-4 rounded-lg border border-theme bg-panel shadow-lg px-3 py-2.5 pointer-events-none">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">Legend</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#3b82f6" }} />
            You
          </div>
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#6366f1" }} />
            Division
          </div>
        </div>
      </div>
    </div>
  );
}
