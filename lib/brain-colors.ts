// Shared color constants for the Dashboard Brain "deep space" visual
// language, used across every zoom level (Galaxy, Solar System, Planet).
// Centralized here (rather than defined per-component) so the same analyst/
// division/viewer colors can't drift out of sync across files — this
// codebase has hit that duplication problem more than once already.

export const ANALYST_COLOR = "#7aa2f7";
export const DIVISION_COLOR = "#bb9af7";
export const VIEWER_RING_COLOR = "#f6c177"; // warm accent ring distinguishing the viewer's own marker from every other analyst
