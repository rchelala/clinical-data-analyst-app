"use client";

import { truncateLabel } from "@/lib/text-utils";

// Presentational only — purely renders a division as a "planet" at (x, y).
// No fetch/state of its own; all interactivity is reported via callback
// props so the parent (SolarSystemView) owns hover/selection state. Mirrors
// the AnalystStar.tsx pattern from the Galaxy zoom.

const PLANET_RADIUS = 18;

export const DIVISION_PLANET_COLOR = "#bb9af7"; // purple, per spec's color table

export interface DivisionPlanetProps {
  x: number;
  y: number;
  name: string;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}

export function DivisionPlanet({
  x,
  y,
  name,
  isHovered,
  onHover,
  onLeave,
  onClick,
}: DivisionPlanetProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        cx={0}
        cy={0}
        r={PLANET_RADIUS}
        fill={DIVISION_PLANET_COLOR}
        stroke={isHovered ? "white" : "rgba(255,255,255,0.4)"}
        strokeWidth={isHovered ? 2 : 1}
        style={{ cursor: "pointer" }}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onClick={onClick}
      />

      <text
        x={0}
        y={PLANET_RADIUS + 16}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="currentColor"
        className="text-primary"
        style={{ pointerEvents: "none" }}
      >
        {truncateLabel(name)}
      </text>
    </g>
  );
}
