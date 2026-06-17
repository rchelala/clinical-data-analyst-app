// Pure layout math for the Dashboard Brain orbital visualization.
// No DOM/React/D3 dependencies here on purpose: the viewing analyst sits at
// the center (origin), dashboards orbit at a server-computed radius driven
// by urgency, and are grouped into division-based angular wedges. Keeping
// this file pure makes it independently unit-testable.

import { Division, DashboardWithUrgency } from './brain-types';

export interface Wedge {
  startAngle: number;
  endAngle: number;
}

export interface PolarPosition {
  x: number;
  y: number;
  angle: number;
}

/**
 * Splits the full 360-degree circle into one equal-sized wedge per division,
 * ordered by `sortOrder`. Wedges are contiguous and non-overlapping, and
 * collectively cover the full circle (sum of all wedge spans === 360).
 *
 * Returns a Map keyed by division.id -> { startAngle, endAngle } in degrees.
 */
export function computeDivisionWedges(
  divisions: Division[]
): Map<number, Wedge> {
  const wedges = new Map<number, Wedge>();
  const divisionCount = divisions.length;

  if (divisionCount === 0) {
    return wedges;
  }

  const sorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const wedgeAngle = 360 / divisionCount;

  sorted.forEach((division, index) => {
    const startAngle = index * wedgeAngle;
    const endAngle = startAngle + wedgeAngle;
    wedges.set(division.id, { startAngle, endAngle });
  });

  return wedges;
}

/**
 * Computes the SVG-ready (x, y) offset (from the center origin) and the
 * polar angle (in degrees) for a single dashboard within its division's
 * wedge. Dashboards are distributed evenly across the wedge's angular range,
 * with small padding reserved on each side so dashboards don't sit flush
 * against a wedge boundary (and risk visually overlapping a neighboring
 * division's dashboards).
 *
 * Angle convention: 0 degrees points to 12 o'clock (straight up), and angles
 * increase clockwise. Standard SVG/math convention has angle 0 point right
 * (+x) with y increasing downward, so converting "12 o'clock, clockwise" to
 * SVG x/y requires `x = radius * sin(angleRad)`, `y = -radius * cos(angleRad)`
 * (this makes angle 0 point up, and increasing angle rotate clockwise
 * toward +x).
 *
 * The radial distance comes from `dashboard.radius`, which is already
 * computed server-side based on urgency.
 */
export function computeDashboardPosition(
  dashboard: DashboardWithUrgency,
  wedge: Wedge,
  indexInDivision: number,
  countInDivision: number
): PolarPosition {
  const wedgeSpan = wedge.endAngle - wedge.startAngle;

  // Reserve 10% padding on each side of the wedge before distributing
  // dashboards, so they never sit flush against a wedge boundary.
  const padding = wedgeSpan * 0.1;
  const usableStart = wedge.startAngle + padding;
  const usableEnd = wedge.endAngle - padding;
  const usableSpan = usableEnd - usableStart;

  // Distribute dashboards evenly across the usable span. With a single
  // dashboard, place it at the center of the usable span.
  const angle =
    countInDivision <= 1
      ? usableStart + usableSpan / 2
      : usableStart + (usableSpan * indexInDivision) / (countInDivision - 1);

  const angleRad = (angle * Math.PI) / 180;
  const radius = dashboard.radius;

  const x = radius * Math.sin(angleRad);
  const y = -radius * Math.cos(angleRad);

  return { x, y, angle };
}

/**
 * Places up to ~8 request "moons" in a tight ring around a dashboard's
 * (x, y) position, evenly spaced by angle starting from angle 0 (the
 * rightmost point of the ring, per standard SVG/math angle convention --
 * this is purely a local decorative ring around the dashboard, not tied to
 * the 12-o'clock/clockwise convention used for dashboard placement).
 *
 * Returns an empty array when `requestCount` is 0. Does not implement the
 * ">8 collapses to a badge" rendering decision -- that's the component
 * layer's responsibility; this function just computes positions for
 * however many moons are requested.
 */
export function computeRequestMoonPositions(
  dashboardX: number,
  dashboardY: number,
  requestCount: number,
  moonRadius: number = 24
): { x: number; y: number }[] {
  if (requestCount <= 0) {
    return [];
  }

  const positions: { x: number; y: number }[] = [];
  const angleStep = (2 * Math.PI) / requestCount;

  for (let i = 0; i < requestCount; i++) {
    const angleRad = i * angleStep;
    positions.push({
      x: dashboardX + moonRadius * Math.cos(angleRad),
      y: dashboardY + moonRadius * Math.sin(angleRad),
    });
  }

  return positions;
}
