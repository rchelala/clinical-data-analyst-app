// Pure layout math for the Dashboard Brain orbital visualization.
// No DOM/React/D3 dependencies here on purpose: the viewing analyst sits at
// the center (origin), dashboards orbit at a server-computed radius driven
// by urgency, and are grouped into division-based angular wedges. Keeping
// this file pure makes it independently unit-testable.

export interface Wedge {
  startAngle: number;
  endAngle: number;
}

export interface PolarPosition {
  x: number;
  y: number;
  angle: number;
}

// Minimal shape computeDivisionWedges needs — deliberately narrower than
// `Division` so this trig can be reused for any sortable, id-bearing item
// (e.g. distributing analyst star-systems around the galaxy center).
export interface SortableItem {
  id: number;
  sortOrder: number;
}

/**
 * Splits the full 360-degree circle into one equal-sized wedge per item,
 * ordered by `sortOrder`. Wedges are contiguous and non-overlapping, and
 * collectively cover the full circle (sum of all wedge spans === 360).
 *
 * Returns a Map keyed by item.id -> { startAngle, endAngle } in degrees.
 */
export function computeDivisionWedges(
  divisions: SortableItem[]
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
 * Smallest inner-ring radius at which `count` items — one per equal angular
 * wedge around the full circle — sit at least `minSpacing` apart
 * (center-to-center) when they all collapse onto that inner ring.
 *
 * Two angularly adjacent items on a ring of radius `r`, separated by
 * `360/count` degrees, are `2 * r * sin(180/count)` apart. Solving that for
 * `r` at the target spacing gives the floor below which planets start
 * overlapping into a knot near the center. Returns 0 for `count < 2` (a lone
 * item has no neighbor to collide with).
 *
 * The floor grows with `count`: the more divisions crowd the inner ring, the
 * larger it must be to keep them clear — which a single fixed MIN_RADIUS
 * constant cannot express.
 */
export function minRadiusForCount(count: number, minSpacing: number): number {
  if (count < 2) return 0;
  return minSpacing / (2 * Math.sin(Math.PI / count));
}

/**
 * Computes the SVG-ready (x, y) offset (from the center origin) and the
 * polar angle (in degrees) for a single item within a wedge. Items are
 * distributed evenly across the wedge's angular range, with small padding
 * reserved on each side so items don't sit flush against a wedge boundary
 * (and risk visually overlapping a neighboring wedge's items).
 *
 * Angle convention: 0 degrees points to 12 o'clock (straight up), and angles
 * increase clockwise. Standard SVG/math convention has angle 0 point right
 * (+x) with y increasing downward, so converting "12 o'clock, clockwise" to
 * SVG x/y requires `x = radius * sin(angleRad)`, `y = -radius * cos(angleRad)`
 * (this makes angle 0 point up, and increasing angle rotate clockwise
 * toward +x).
 *
 * `radius` is the radial distance from the center origin (already computed
 * by the caller, e.g. server-side based on urgency, or a per-division
 * aggregate). Pass `index=0, count=1` to place a single item at the wedge's
 * angular center (e.g. a division node within its own wedge).
 */
export function computePositionInWedge(
  radius: number,
  wedge: Wedge,
  index: number,
  count: number
): PolarPosition {
  const wedgeSpan = wedge.endAngle - wedge.startAngle;

  // Reserve 10% padding on each side of the wedge before distributing
  // items, so they never sit flush against a wedge boundary.
  const padding = wedgeSpan * 0.1;
  const usableStart = wedge.startAngle + padding;
  const usableEnd = wedge.endAngle - padding;
  const usableSpan = usableEnd - usableStart;

  // Distribute items evenly across the usable span. With a single item,
  // place it at the center of the usable span.
  const angle =
    count <= 1
      ? usableStart + usableSpan / 2
      : usableStart + (usableSpan * index) / (count - 1);

  const angleRad = (angle * Math.PI) / 180;

  const x = radius * Math.sin(angleRad);
  const y = -radius * Math.cos(angleRad);

  return { x, y, angle };
}

/**
 * Distributes `count` items evenly around the full 360-degree circle at a
 * fixed `radius` from the center origin, starting at 12 o'clock and going
 * clockwise (no wedge boundaries/padding — unlike `computePositionInWedge`,
 * which carves out angular slices for divisions). Used for items that share
 * one ring with no grouping, e.g. analyst star-systems around the galaxy
 * center, or a single analyst's division dots around their own star.
 *
 * Same angle convention as `computePositionInWedge`: 0 degrees is straight
 * up, increasing clockwise. Pass `count=1` to place the lone item at the top
 * (angle 0) rather than dividing by zero.
 */
export function computeEvenlySpacedPositions(
  radius: number,
  index: number,
  count: number
): PolarPosition {
  const angle = count <= 0 ? 0 : (360 * index) / count;
  const angleRad = (angle * Math.PI) / 180;

  const x = radius * Math.sin(angleRad);
  const y = -radius * Math.cos(angleRad);

  return { x, y, angle };
}
