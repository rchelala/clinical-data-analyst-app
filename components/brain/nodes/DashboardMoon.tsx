"use client";

import { DashboardStatus } from "@/lib/brain-types";

// Presentational only — a tiny decorative dot orbiting a DivisionPlanet,
// representing one dashboard/subscription. No labels, no click handler:
// full interactivity for these entities happens one zoom level deeper, at
// the Planet zoom (DivisionGraphBrain), which already renders them with
// status rings. Colors reused verbatim from lib/brain-graph.ts's
// STATUS_RING_COLORS so the same status reads the same color at every zoom
// level.

const MOON_RADIUS = 4;

// Matches lib/brain-graph.ts STATUS_RING_COLORS exactly.
const STATUS_COLORS: Record<DashboardStatus, string> = {
  active: "#22c55e", // green-500
  maintenance: "#f59e0b", // amber-500 — rendered as the moon's ring, per spec's "orange ring" callout
  retired: "#64748b", // slate-500
};

export const MOON_STATUS_COLORS = STATUS_COLORS;

export interface DashboardMoonProps {
  x: number;
  y: number;
  status: DashboardStatus;
}

export function DashboardMoon({ x, y, status }: DashboardMoonProps) {
  const color = STATUS_COLORS[status];
  // Per spec: fill = status color for active/retired; maintenance reads as
  // an orange RING with a neutral fill, so the ring conveys "maintenance"
  // without overloading the fill slot.
  const isMaintenance = status === "maintenance";

  return (
    <circle
      cx={x}
      cy={y}
      r={MOON_RADIUS}
      fill={isMaintenance ? "none" : color}
      stroke={isMaintenance ? color : "none"}
      strokeWidth={isMaintenance ? 1.5 : 0}
      style={{ pointerEvents: "none" }}
    />
  );
}
