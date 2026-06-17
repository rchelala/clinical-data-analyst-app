"use client";

import { useMemo, useState } from "react";
import { computeDivisionWedges, computePositionInWedge } from "@/lib/layout-math";
import { Division } from "@/lib/brain-types";

export interface DivisionNode {
  division: Division;
  radius: number; // already computed by the caller as min(...child radii) across that division's owned dashboards+subscriptions
}

interface DivisionBrainProps {
  divisionNodes: DivisionNode[]; // already filtered by the caller to only divisions the current analyst owns something in
  onSelectDivision: (divisionId: number) => void;
}

interface PositionedDivision {
  node: DivisionNode;
  x: number;
  y: number;
}

const VIEWBOX_HALF = 450;
const DIVISION_DOT_RADIUS = 18;

export function DivisionBrain({ divisionNodes, onSelectDivision }: DivisionBrainProps) {
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

  const sortedWedges = useMemo(
    () => [...wedges.values()].sort((a, b) => a.startAngle - b.startAngle),
    [wedges]
  );

  const hovered = positioned.find((p) => p.node.division.id === hoveredId) ?? null;

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
                {node.division.name}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
          <p className="text-sm font-semibold text-primary">{hovered.node.division.name}</p>
        </div>
      )}
    </div>
  );
}
