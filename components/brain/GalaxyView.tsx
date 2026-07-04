"use client";

import { useMemo, useState } from "react";
import { useFitScale } from "@/hooks/useFitScale";
import { computeEvenlySpacedPositions } from "@/lib/layout-math";
import { AnalystSummary } from "@/lib/brain-types";
import { BrainFilters, isAnalystFocused } from "@/lib/filters";
import { AnalystStar } from "@/components/brain/nodes/AnalystStar";
import { ANALYST_COLOR, DIVISION_COLOR, VIEWER_RING_COLOR } from "@/lib/brain-colors";
import { DetailPanel, DetailPanelRow } from "@/components/brain/DetailPanel";
import { Legend } from "@/components/brain/Legend";

interface GalaxyViewProps {
  summaries: AnalystSummary[];
  viewerAnalystId: number | null;
  filters: BrainFilters;
  onSelectAnalyst: (analystId: number) => void;
}

interface PositionedAnalyst {
  summary: AnalystSummary;
  x: number;
  y: number;
}

const VIEWBOX_HALF = 450;
const GALAXY_RADIUS = 320; // distance of each analyst star from the galaxy center — large relative to each star's own division ring (26px) so stars/rings never visually collide

export function GalaxyView({ summaries, viewerAnalystId, filters, onSelectAnalyst }: GalaxyViewProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // Scales the whole galaxy visualization down to fit small (< 760px)
  // containers, e.g. mobile portrait widths. Capped at 1, so on desktop
  // (container always >= 760px here) this computes to exactly 1 and
  // `transform: scale(1)` is a no-op — desktop rendering is unchanged.
  // 760 = 2 * GALAXY_RADIUS (320) + margin for star/ring size and labels.
  const { ref: fitRef, scale } = useFitScale(760);

  // Analyst star-systems distributed evenly around one ring centered on the
  // galaxy origin — the most spec-aligned reading of "Galaxy" for the small
  // analyst counts this app has (single digits today, designed to hold up
  // to ~20). A grid would read less thematically "galaxy" and isn't needed
  // at this scale.
  const positioned = useMemo<PositionedAnalyst[]>(() => {
    const count = summaries.length;
    return summaries.map((summary, index) => {
      const { x, y } = computeEvenlySpacedPositions(GALAXY_RADIUS, index, count);
      return { summary, x, y };
    });
  }, [summaries]);

  const hovered = positioned.find((p) => p.summary.id === hoveredId) ?? null;

  const hoveredRows = useMemo<DetailPanelRow[]>(() => {
    if (!hovered) return [];
    const { summary } = hovered;
    return [
      { label: "Divisions", value: summary.divisionCount },
      { label: "Dashboards", value: summary.dashboardCount },
      { label: "Subscriptions", value: summary.subscriptionCount },
      { label: "High urgency", value: summary.highUrgencyCount },
    ];
  }, [hovered]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        ref={fitRef}
        className="w-full h-full max-w-[900px] max-h-[900px] flex items-center justify-center"
      >
        {/* Scale wrapper: identity transform (scale(1)) on desktop where the
            container is >= the 760 design size, so this div is purely
            structural there and doesn't alter desktop layout. Below that
            size it uniformly shrinks the galaxy so it fits without
            overflowing the viewport. */}
        <div
          className="w-full h-full"
          style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
        >
          <svg
            viewBox={`-${VIEWBOX_HALF} -${VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`}
            className="w-full h-full"
          >
            {positioned.map(({ summary, x, y }) => (
              <AnalystStar
                key={summary.id}
                x={x}
                y={y}
                name={summary.name}
                divisionCount={summary.divisionCount}
                isViewer={summary.id === viewerAnalystId}
                isHovered={hoveredId === summary.id}
                isFaded={!isAnalystFocused(summary.id, filters)}
                onHover={() => setHoveredId(summary.id)}
                onLeave={() => setHoveredId((id) => (id === summary.id ? null : id))}
                onClick={() => onSelectAnalyst(summary.id)}
              />
            ))}
          </svg>
        </div>
      </div>

      {hovered && <DetailPanel title={hovered.summary.name} rows={hoveredRows} />}

      <Legend
        items={[
          { color: ANALYST_COLOR, label: "Analyst" },
          { color: VIEWER_RING_COLOR, label: "You (ring)" },
          { color: DIVISION_COLOR, label: "Division" },
        ]}
      />
    </div>
  );
}
