// Filter state types + pure predicate helpers for the Galaxy View filter
// rail (GALAXY_VIEW_SPEC.md section 8). Kept dependency-free (no React) so
// the predicates are trivially callable from any zoom-level view component.

import { DashboardStatus, RequestStatus, UrgencyBucket } from '@/lib/brain-types';

export interface BrainFilters {
  urgency: Set<UrgencyBucket>; // default: all 3 (no filtering effect)
  status: Set<DashboardStatus>; // default: all 3
  requestState: Set<RequestStatus>; // default: all 3
  analystFocus: number[]; // default: []; 1 id = solo, 2 ids = compare (Galaxy zoom only)
}

export function createDefaultFilters(): BrainFilters {
  return {
    urgency: new Set<UrgencyBucket>(['high', 'med', 'low']),
    status: new Set<DashboardStatus>(['active', 'maintenance', 'retired']),
    requestState: new Set<RequestStatus>(['open', 'in_progress', 'done']),
    analystFocus: [],
  };
}

export function isUrgencyVisible(bucket: UrgencyBucket, filters: BrainFilters): boolean {
  return filters.urgency.has(bucket);
}

export function isStatusVisible(status: DashboardStatus, filters: BrainFilters): boolean {
  return filters.status.has(status);
}

export function isRequestStatusVisible(status: RequestStatus, filters: BrainFilters): boolean {
  return filters.requestState.has(status);
}

export function isAnalystFocused(analystId: number, filters: BrainFilters): boolean {
  // No focus selected => nothing is excluded by this rule.
  if (filters.analystFocus.length === 0) return true;
  return filters.analystFocus.includes(analystId);
}

// Shared faded-opacity constant, reused across every fading rule (Galaxy
// analyst-focus fade, Solar System status/urgency fade, Planet zoom
// status/urgency/request-state fade) so "filtered out" always reads the
// same visual weight everywhere in the app. Internal: call sites should go
// through `fadeOpacity()` below rather than using this constant directly.
const FADED_OPACITY = 0.2;

// Additional multiplier applied on top of DivisionGraphBrain's existing
// request-status-based link opacity (solid/dashed/faded-by-status), so a
// request-state-filtered-out link/node visibly dims further without
// replacing that existing styling. Internal: call sites should go through
// `fadeOpacity()` below rather than using this constant directly.
const FADE_MULTIPLIER = 0.15;

// Single entry point for applying the app's "filtered out" fade to an
// opacity/alpha value, so no call site has to choose between FADED_OPACITY
// and FADE_MULTIPLIER directly (that ambiguity — two bare numbers that look
// interchangeable — is what caused the DivisionGraphBrain node-opacity bug).
//
// `baseAlpha` is the opacity/alpha the caller would use if nothing were
// faded. `mode` says which fade treatment applies, explicitly — never
// inferred from the value of `baseAlpha`, since e.g. a request node's
// standalone opacity and a fully-opaque link's alpha can both be 1 but need
// different fade math:
//   - "standalone": this is the only thing controlling the element's
//     opacity (nothing else drawn underneath it) — e.g. AnalystStar,
//     DashboardMoon, DivisionPlanet, and DivisionGraphBrain's entity/request
//     node opacity. When faded, returns the standalone FADED_OPACITY (0.2),
//     ignoring baseAlpha (pass 1).
//   - "multiplicative": layers the fade on top of an existing alpha that
//     already varies independently of this filter — e.g. DivisionGraphBrain's
//     request-status-based link color. When faded, scales baseAlpha down by
//     FADE_MULTIPLIER (0.15) so it dims further without being replaced.
export function fadeOpacity(
  baseAlpha: number,
  faded: boolean,
  mode: "standalone" | "multiplicative" = "standalone"
): number {
  if (!faded) return baseAlpha;
  return mode === "standalone" ? FADED_OPACITY : baseAlpha * FADE_MULTIPLIER;
}
