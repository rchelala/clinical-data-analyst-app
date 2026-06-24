"use client";

// Quiet, optional enhancement shown in the division (Planet) view: surfaces
// which OTHER analysts also cover this division (with their own dashboards/
// subscriptions), and lets the viewer jump straight into that analyst's view
// of the same division. Deliberately has no loading/error UI of its own —
// per design, if there's nothing to show (still loading, fetch failed, or
// genuinely no other coverage), this renders null rather than drawing
// attention to itself. Mounts once per division-view visit (not hover-
// triggered), so unlike the old hover badge it needs no cache and no grace-
// period timers.

import { useEffect, useState } from "react";
import { DivisionAnalystCoverage } from "@/lib/brain-types";

interface OtherAnalystsPanelProps {
  divisionId: number;
  excludeAnalystId: number;
  onJumpToAnalyst: (analystId: number) => void;
}

export function OtherAnalystsPanel({
  divisionId,
  excludeAnalystId,
  onJumpToAnalyst,
}: OtherAnalystsPanelProps) {
  const [others, setOthers] = useState<DivisionAnalystCoverage[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setExpanded(false);

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
    <div className="absolute top-4 right-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg">
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
              onClick={() => onJumpToAnalyst(analyst.id)}
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
