"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnalystSummary,
  DashboardWithUrgency,
  Division,
  ReportSubscriptionWithUrgency,
} from "@/lib/brain-types";
import { fetchDivisions } from "@/lib/reference-data";

export type ZoomState =
  | { level: "galaxy" }
  | { level: "analyst"; analystId: number }
  | { level: "division"; analystId: number; divisionId: number };

interface GalaxyData {
  galaxySummaries: AnalystSummary[];
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

interface AnalystData {
  divisions: Division[];
  dashboards: DashboardWithUrgency[];
  subscriptions: ReportSubscriptionWithUrgency[];
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

// Cache entries keyed by 'galaxy' or the analyst id whose scoped data was
// fetched. Division-level zoom reuses the analyst-level cache entry, since
// the division view filters client-side from the same analyst-scoped data.
type CacheEntry =
  | { kind: "galaxy"; data: AnalystSummary[] }
  | {
      kind: "analyst";
      data: {
        divisions: Division[];
        dashboards: DashboardWithUrgency[];
        subscriptions: ReportSubscriptionWithUrgency[];
      };
    };

async function fetchGalaxySummaries(): Promise<AnalystSummary[]> {
  const res = await fetch("/api/brain/galaxy");
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Could not load galaxy summary.");
  }
  return data;
}

async function fetchAnalystScopedData(analystId: number): Promise<{
  divisions: Division[];
  dashboards: DashboardWithUrgency[];
  subscriptions: ReportSubscriptionWithUrgency[];
}> {
  const headers: HeadersInit = { "x-analyst-id": String(analystId) };

  // Divisions are org-wide, unscoped reference data — shared via
  // lib/reference-data.ts's cache so switching between analysts here
  // doesn't refetch the same division list every time.
  const [divisionsData, dashboardsRes, subscriptionsRes] = await Promise.all([
    fetchDivisions(),
    fetch("/api/dashboards", { headers }),
    fetch("/api/report-subscriptions", { headers }),
  ]);

  const [dashboardsData, subscriptionsData] = await Promise.all([
    dashboardsRes.json().catch(() => null),
    subscriptionsRes.json().catch(() => null),
  ]);

  if (!dashboardsRes.ok) {
    throw new Error(dashboardsData?.error ?? "Could not load dashboards.");
  }
  if (!subscriptionsRes.ok) {
    throw new Error(subscriptionsData?.error ?? "Could not load report subscriptions.");
  }

  return {
    divisions: divisionsData,
    dashboards: dashboardsData,
    subscriptions: subscriptionsData,
  };
}

export type RefreshScope = "entity-data" | "structure";

/**
 * Fetches the data needed for a given zoom level, caching results in-memory
 * for the lifetime of the component tree so re-entering a previously visited
 * zoom level doesn't refetch. Passing a `refreshKey` that changes (e.g. after
 * a save in the Brain side panel) busts cache entries according to
 * `refreshScope`:
 *
 * - "entity-data" (the default) busts only the current zoom's own entry,
 *   plus the 'galaxy' entry (which aggregates across every analyst/division
 *   and so could be affected by any edit) — leaving every OTHER analyst's
 *   cached entry untouched. Use this for same-scope refreshes like a request
 *   status change or count update that can't affect any other analyst's or
 *   division's cached view.
 * - "structure" clears the entire cache. Use this for structural edits —
 *   an entity (dashboard/subscription) or division created, deleted,
 *   converted, moved, or reassigned to a different analyst — any of which
 *   can leave some OTHER analyst's or division's cached entry stale.
 *
 * A refetch triggered purely by a refreshKey bump (same zoom level as
 * before, data previously loaded) sets `isRefreshing` instead of `loading`,
 * so callers can keep rendering the existing data/canvas in place rather
 * than unmounting it — only the very first fetch for a given zoom level
 * (or a genuine navigation to a not-yet-cached zoom level) sets `loading`.
 */
export function useBrainData(
  zoom: ZoomState,
  refreshKey?: number,
  refreshScope: RefreshScope = "entity-data"
): GalaxyData | AnalystData {
  const cacheRef = useRef<Map<string | number, CacheEntry>>(new Map());
  const prevRefreshKeyRef = useRef(refreshKey);
  const prevCacheKeyRef = useRef<string | number | undefined>(undefined);

  const [galaxySummaries, setGalaxySummaries] = useState<AnalystSummary[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [subscriptions, setSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = zoom.level === "galaxy" ? "galaxy" : zoom.analystId;

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;

    const cacheKeyChanged = cacheKey !== prevCacheKeyRef.current;
    prevCacheKeyRef.current = cacheKey;

    const refreshKeyChanged = refreshKey !== prevRefreshKeyRef.current;
    prevRefreshKeyRef.current = refreshKey;

    if (refreshKeyChanged) {
      if (refreshScope === "structure") {
        // A structural edit (entity/division created, deleted, converted,
        // moved, or reassigned) can affect any OTHER analyst's or
        // division's cached view, not just the one currently on screen —
        // clear everything rather than guessing which entries are safe.
        cache.clear();
      } else {
        cache.delete(cacheKey);
        if (cacheKey !== "galaxy") cache.delete("galaxy");
      }
    }

    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.kind === "galaxy") {
        setGalaxySummaries(cached.data);
      } else {
        setDivisions(cached.data.divisions);
        setDashboards(cached.data.dashboards);
        setSubscriptions(cached.data.subscriptions);
      }
      setError(null);
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    // Stale-while-refresh only applies when we're refetching the SAME zoom
    // level in response to a refreshKey bump — a genuine navigation to a
    // not-yet-cached zoom level always blocks with `loading`, since there's
    // no relevant existing data to keep showing meanwhile.
    if (!cacheKeyChanged && refreshKeyChanged) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    (async () => {
      try {
        if (zoom.level === "galaxy") {
          const data = await fetchGalaxySummaries();
          if (cancelled) return;
          cache.set(cacheKey, { kind: "galaxy", data });
          setGalaxySummaries(data);
        } else {
          const data = await fetchAnalystScopedData(zoom.analystId);
          if (cancelled) return;
          cache.set(cacheKey, { kind: "analyst", data });
          setDivisions(data.divisions);
          setDashboards(data.dashboards);
          setSubscriptions(data.subscriptions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error — could not reach the server.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, zoom.level, refreshKey]);

  if (zoom.level === "galaxy") {
    return { galaxySummaries, loading, isRefreshing, error };
  }

  return { divisions, dashboards, subscriptions, loading, isRefreshing, error };
}
