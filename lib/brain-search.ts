// Pure search-resolution logic for the Galaxy View filter rail's typeahead
// (GALAXY_VIEW_SPEC.md section 8). Matches case-insensitively against
// dashboard/subscription names, division names, and stakeholder strings,
// and resolves each match to a ZoomState the page can navigate straight to.
// Kept framework-free (no React) so it's easily called from a useMemo in
// app/brain/page.tsx.

import {
  Analyst,
  DashboardWithUrgency,
  Division,
  ReportSubscriptionWithUrgency,
} from '@/lib/brain-types';
import { ZoomState } from '@/hooks/useBrainData';

export interface SearchResult {
  id: string; // unique key, e.g. `dashboard-${id}` or `division-${id}`
  label: string; // display text, e.g. "Quarterly Revenue (dashboard)"
  targetZoom: ZoomState; // where clicking this result should navigate
}

const MAX_RESULTS = 20;

interface ResolveContext {
  allDashboards: DashboardWithUrgency[];
  allSubscriptions: ReportSubscriptionWithUrgency[];
  allDivisions: Division[];
  analysts: Analyst[];
  viewerAnalystId: number | null;
}

// Resolves the analyst id whose solar system a dashboard/subscription match
// should zoom into: the entity's own analystId (nullable in this schema),
// falling back to the current viewer, falling back to the first analyst in
// the org. Returns null if no analyst id can be resolved at all (e.g. the
// analysts list itself is empty) — callers should skip producing a result
// in that case rather than emit a broken ZoomState.
function resolveAnalystIdForEntity(
  entityAnalystId: number | null,
  ctx: ResolveContext
): number | null {
  return entityAnalystId ?? ctx.viewerAnalystId ?? ctx.analysts[0]?.id ?? null;
}

function resolveAnalystIdForDivision(division: Division, ctx: ResolveContext): number | null {
  if (division.createdByAnalystId !== null) return division.createdByAnalystId;

  const ownedDashboard = ctx.allDashboards.find((d) => d.divisionId === division.id);
  if (ownedDashboard?.analystId != null) return ownedDashboard.analystId;

  const ownedSubscription = ctx.allSubscriptions.find((s) => s.divisionId === division.id);
  if (ownedSubscription?.analystId != null) return ownedSubscription.analystId;

  return ctx.viewerAnalystId ?? ctx.analysts[0]?.id ?? null;
}

function matches(haystack: string | null | undefined, query: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(query);
}

/**
 * Builds the full ranked list of search results for the given query,
 * deduping identical stakeholder strings into a single result. Capped at
 * MAX_RESULTS so the dropdown stays manageable. Returns [] for an empty/
 * whitespace-only query.
 */
export function resolveSearchResults(rawQuery: string, ctx: ResolveContext): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: SearchResult[] = [];
  const seenStakeholders = new Set<string>();

  for (const dashboard of ctx.allDashboards) {
    if (results.length >= MAX_RESULTS) break;

    const analystId = resolveAnalystIdForEntity(dashboard.analystId, ctx);
    const targetZoom: ZoomState | null =
      analystId !== null
        ? { level: 'division', analystId, divisionId: dashboard.divisionId }
        : null;

    if (matches(dashboard.name, query) && targetZoom) {
      results.push({
        id: `dashboard-${dashboard.id}`,
        label: `${dashboard.name} (dashboard)`,
        targetZoom,
      });
    }

    if (
      dashboard.stakeholder &&
      matches(dashboard.stakeholder, query) &&
      targetZoom &&
      !seenStakeholders.has(dashboard.stakeholder.toLowerCase())
    ) {
      seenStakeholders.add(dashboard.stakeholder.toLowerCase());
      results.push({
        id: `stakeholder-dashboard-${dashboard.id}`,
        label: `${dashboard.stakeholder} (stakeholder)`,
        targetZoom,
      });
    }
  }

  for (const subscription of ctx.allSubscriptions) {
    if (results.length >= MAX_RESULTS) break;

    const analystId = resolveAnalystIdForEntity(subscription.analystId, ctx);
    const targetZoom: ZoomState | null =
      analystId !== null
        ? { level: 'division', analystId, divisionId: subscription.divisionId }
        : null;

    if (matches(subscription.name, query) && targetZoom) {
      results.push({
        id: `subscription-${subscription.id}`,
        label: `${subscription.name} (subscription)`,
        targetZoom,
      });
    }

    if (
      subscription.stakeholder &&
      matches(subscription.stakeholder, query) &&
      targetZoom &&
      !seenStakeholders.has(subscription.stakeholder.toLowerCase())
    ) {
      seenStakeholders.add(subscription.stakeholder.toLowerCase());
      results.push({
        id: `stakeholder-subscription-${subscription.id}`,
        label: `${subscription.stakeholder} (stakeholder)`,
        targetZoom,
      });
    }
  }

  for (const division of ctx.allDivisions) {
    if (results.length >= MAX_RESULTS) break;
    if (!matches(division.name, query)) continue;

    const analystId = resolveAnalystIdForDivision(division, ctx);
    if (analystId === null) continue;

    results.push({
      id: `division-${division.id}`,
      label: `${division.name} (division)`,
      targetZoom: { level: 'division', analystId, divisionId: division.id },
    });
  }

  return results.slice(0, MAX_RESULTS);
}
