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
// same visual weight everywhere in the app.
export const FADED_OPACITY = 0.2;

// Additional multiplier applied on top of DivisionGraphBrain's existing
// request-status-based link opacity (solid/dashed/faded-by-status), so a
// request-state-filtered-out link/node visibly dims further without
// replacing that existing styling.
export const FADE_MULTIPLIER = 0.15;
