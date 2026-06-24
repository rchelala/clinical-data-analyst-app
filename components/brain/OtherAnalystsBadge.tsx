"use client";

// Quiet, optional enhancement shown alongside DetailPanel when a division is
// hovered in SolarSystemView: surfaces which OTHER analysts also cover this
// division (with their own dashboards/subscriptions), and lets the viewer
// jump straight into that analyst's view of the same division. Deliberately
// has no loading/error UI of its own — per design, if there's nothing to
// show (still loading, fetch failed, or genuinely no other coverage), this
// renders null rather than drawing attention to itself.

import { useEffect, useState } from "react";
import { DivisionAnalystCoverage } from "@/lib/brain-types";

interface OtherAnalystsBadgeProps {
  divisionId: number;
  excludeAnalystId: number;
  onJumpToAnalyst: (analystId: number, divisionId: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

// Module-level cache so repeat hovers of the same division within the page
// session don't re-fetch — persists across mounts/unmounts of this component
// for the lifetime of the page. Intentionally simple: no TTL/invalidation:
// this is a lightweight, low-stakes discovery feature, not a source of truth.
const coverageCache = new Map<number, DivisionAnalystCoverage[]>();

export function OtherAnalystsBadge({
  divisionId,
  excludeAnalystId,
  onJumpToAnalyst,
  onMouseEnter,
  onMouseLeave,
}: OtherAnalystsBadgeProps) {
  const [others, setOthers] = useState<DivisionAnalystCoverage[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setExpanded(false);

    const cached = coverageCache.get(divisionId);
    if (cached) {
      setOthers(cached.filter((a) => a.id !== excludeAnalystId));
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/divisions/${divisionId}/analysts`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          console.error("Fetch other analysts error:", data);
          setOthers([]);
          return;
        }

        const coverage = data as DivisionAnalystCoverage[];
        coverageCache.set(divisionId, coverage);
        setOthers(coverage.filter((a) => a.id !== excludeAnalystId));
      } catch (err) {
        if (!cancelled) {
          console.error("Fetch other analysts error:", err);
          setOthers([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [divisionId, excludeAnalystId]);

  if (others.length === 0) return null;

  return (
    <div
      className="absolute top-4 right-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary transition-colors"
      >
        +{others.length} other analyst{others.length === 1 ? "" : "s"}
      </button>

      {expanded && (
        <div className="flex flex-col gap-0.5 px-3 pb-2 pt-1 border-t border-theme">
          {others.map((analyst) => (
            <button
              key={analyst.id}
              type="button"
              onClick={() => onJumpToAnalyst(analyst.id, divisionId)}
              className="text-left text-xs text-secondary hover:text-primary transition-colors py-0.5"
            >
              <span className="font-medium text-primary">{analyst.name}</span>
              {" — "}
              {analyst.dashboardCount} dashboard{analyst.dashboardCount === 1 ? "" : "s"},{" "}
              {analyst.subscriptionCount} subscription{analyst.subscriptionCount === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
