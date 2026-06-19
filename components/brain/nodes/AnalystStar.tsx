"use client";

import { computeEvenlySpacedPositions } from "@/lib/layout-math";

// Presentational only — purely renders an analyst as a "star" at (x, y) plus
// a faint ring of small dots representing that analyst's divisions. No
// fetch/state of its own; all interactivity is reported via callback props
// so the parent (GalaxyView) owns hover/selection state.

const STAR_RADIUS = 14;
const VIEWER_STAR_RADIUS = 16; // viewer's own star drawn slightly larger, with a distinct ring color, so it reads as "you" at a glance
const DIVISION_DOT_RADIUS = 3;
const DIVISION_RING_RADIUS = 26; // small ring around the star — must stay noticeably smaller than inter-star spacing so it reads as "this star's ring," not galaxy-wide noise
const MAX_LABEL_LENGTH = 16;

const ANALYST_COLOR = "#7aa2f7";
const DIVISION_COLOR = "#bb9af7";
const VIEWER_RING_COLOR = "#f6c177"; // warm accent ring distinguishing the viewer's own star from every other analyst

// Same truncation convention as DivisionBrain.tsx's truncateLabel/
// MAX_LABEL_LENGTH — replicated locally since DivisionBrain.tsx is staying
// untouched (it'll be absorbed into SolarSystemView in a later task, not
// extracted into a shared util now).
function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_LENGTH
    ? `${name.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : name;
}

export interface AnalystStarProps {
  x: number;
  y: number;
  name: string;
  divisionCount: number;
  isViewer: boolean;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}

export function AnalystStar({
  x,
  y,
  name,
  divisionCount,
  isViewer,
  isHovered,
  onHover,
  onLeave,
  onClick,
}: AnalystStarProps) {
  const radius = isViewer ? VIEWER_STAR_RADIUS : STAR_RADIUS;

  const divisionDots = Array.from({ length: divisionCount }, (_, i) =>
    computeEvenlySpacedPositions(DIVISION_RING_RADIUS, i, divisionCount)
  );

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Faint ring + dots representing this analyst's divisions — purely
          decorative at this zoom level, no labels, no interactivity. */}
      <circle
        cx={0}
        cy={0}
        r={DIVISION_RING_RADIUS}
        fill="none"
        stroke={DIVISION_COLOR}
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      {divisionDots.map((pos, i) => (
        <circle
          key={i}
          cx={pos.x}
          cy={pos.y}
          r={DIVISION_DOT_RADIUS}
          fill={DIVISION_COLOR}
          fillOpacity={0.45}
        />
      ))}

      {/* The star itself. */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={ANALYST_COLOR}
        stroke={isViewer ? VIEWER_RING_COLOR : isHovered ? "white" : "rgba(255,255,255,0.4)"}
        strokeWidth={isViewer ? 3 : isHovered ? 2 : 1}
        style={{ cursor: "pointer" }}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onClick={onClick}
      />

      <text
        x={0}
        y={radius + 16}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="currentColor"
        className="text-primary"
        style={{ pointerEvents: "none" }}
      >
        {truncateLabel(name)}
        {isViewer ? " (You)" : ""}
      </text>
    </g>
  );
}
