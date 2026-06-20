"use client";

import { computeEvenlySpacedPositions } from "@/lib/layout-math";
import { truncateLabel } from "@/lib/text-utils";
import { Glow, GLOW_SCALE } from "@/components/brain/nodes/Glow";
import { FADED_OPACITY } from "@/lib/filters";

// Presentational only — purely renders an analyst as a "star" at (x, y) plus
// a faint ring of small dots representing that analyst's divisions. No
// fetch/state of its own; all interactivity is reported via callback props
// so the parent (GalaxyView) owns hover/selection state.

const STAR_RADIUS = 14;
const VIEWER_STAR_RADIUS = 16; // viewer's own star drawn slightly larger, with a distinct ring color, so it reads as "you" at a glance
const DIVISION_DOT_RADIUS = 3;
const DIVISION_RING_RADIUS = 26; // small ring around the star — must stay noticeably smaller than inter-star spacing so it reads as "this star's ring," not galaxy-wide noise

export const ANALYST_COLOR = "#7aa2f7";
export const DIVISION_COLOR = "#bb9af7";
export const VIEWER_RING_COLOR = "#f6c177"; // warm accent ring distinguishing the viewer's own star from every other analyst

export interface AnalystStarProps {
  x: number;
  y: number;
  name: string;
  divisionCount: number;
  isViewer: boolean;
  isHovered: boolean;
  // True when this analyst is faded out by the analyst-focus filter (solo/
  // compare picker in FilterRail) — fades the whole star system to
  // FADED_OPACITY rather than hiding it, per the "fade, not disappear" rule.
  isFaded: boolean;
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
  isFaded,
  onHover,
  onLeave,
  onClick,
}: AnalystStarProps) {
  const radius = isViewer ? VIEWER_STAR_RADIUS : STAR_RADIUS;

  const divisionDots = Array.from({ length: divisionCount }, (_, i) =>
    computeEvenlySpacedPositions(DIVISION_RING_RADIUS, i, divisionCount)
  );

  return (
    <g transform={`translate(${x}, ${y})`} opacity={isFaded ? FADED_OPACITY : 1}>
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

      {/* Low-opacity, blurred glow behind the star — must come before the
          solid circle below since SVG paints in document order. */}
      <Glow cx={0} cy={0} radius={radius * GLOW_SCALE} color={ANALYST_COLOR} />

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
