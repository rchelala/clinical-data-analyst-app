"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnalystSummary,
  DashboardWithUrgency,
  Division,
  ReportSubscriptionWithUrgency,
} from "@/lib/brain-types";

export type ZoomState =
  | { level: "galaxy" }
  | { level: "analyst"; analystId: number }
  | { level: "division"; analystId: number; divisionId: number };

interface GalaxyData {
  galaxySummaries: AnalystSummary[];
  loading: boolean;
  error: string | null;
}

interface AnalystData {
  divisions: Division[];
  dashboards: DashboardWithUrgency[];
  subscriptions: ReportSubscriptionWithUrgency[];
  loading: boolean;
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

  const [divisionsRes, dashboardsRes, subscriptionsRes] = await Promise.all([
    fetch("/api/divisions"),
    fetch("/api/dashboards", { headers }),
    fetch("/api/report-subscriptions", { headers }),
  ]);

  const [divisionsData, dashboardsData, subscriptionsData] = await Promise.all([
    divisionsRes.json().catch(() => null),
    dashboardsRes.json().catch(() => null),
    subscriptionsRes.json().catch(() => null),
  ]);

  if (!divisionsRes.ok) {
    throw new Error(divisionsData?.error ?? "Could not load divisions.");
  }
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

/**
 * Fetches the data needed for a given zoom level, caching results in-memory
 * for the lifetime of the component tree so re-entering a previously visited
 * zoom level doesn't refetch. Refetch/invalidation is intentionally not
 * implemented — fetch-once-per-key, reuse-after is sufficient for now.
 */
export function useBrainData(zoom: ZoomState): GalaxyData | AnalystData {
  const cacheRef = useRef<Map<string | number, CacheEntry>>(new Map());

  const [galaxySummaries, setGalaxySummaries] = useState<AnalystSummary[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [dashboards, setDashboards] = useState<DashboardWithUrgency[]>([]);
  const [subscriptions, setSubscriptions] = useState<ReportSubscriptionWithUrgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = zoom.level === "galaxy" ? "galaxy" : zoom.analystId;

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;

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
      return;
    }

    setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, zoom.level]);

  if (zoom.level === "galaxy") {
    return { galaxySummaries, loading, error };
  }

  return { divisions, dashboards, subscriptions, loading, error };
}
