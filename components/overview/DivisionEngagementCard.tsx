// Presentational card for one division's engagement summary on the
// Division Overview page. Deliberately customer/delivery-focused — no
// analyst names or per-analyst breakdowns (see app/overview/page.tsx
// framing rule: this page is about divisions, not who did the work).

import Link from "next/link";
import { LayoutDashboard, Mail, Flame } from "lucide-react";
import { DivisionOverview, EngagementTier } from "@/lib/brain-types";

interface DivisionEngagementCardProps {
  division: DivisionOverview;
}

const TIER_LABEL: Record<EngagementTier, string> = {
  active: "Active",
  warm: "Warm",
  dormant: "Dormant",
};

const TIER_CLASSNAME: Record<EngagementTier, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warm: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  dormant: "bg-white/5 text-secondary border-theme",
};

function recencyLabel(daysSinceActivity: number | null): string {
  if (daysSinceActivity === null) return "No recent activity";
  if (daysSinceActivity === 0) return "Active today";
  if (daysSinceActivity === 1) return "Last activity 1 day ago";
  return `Last activity ${daysSinceActivity} days ago`;
}

export function DivisionEngagementCard({ division }: DivisionEngagementCardProps) {
  const demand = division.openRequests + division.inProgressRequests + division.openTasks;

  return (
    <Link
      href={`/overview/${division.id}`}
      className="rounded-lg border border-theme bg-panel px-4 py-3.5 shadow-panel flex flex-col gap-3 transition-all hover:border-brand-500/40 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary leading-snug">{division.name}</h3>
        <span
          className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TIER_CLASSNAME[division.engagementTier]}`}
        >
          {TIER_LABEL[division.engagementTier]}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/10">
        <div className="text-center px-1">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-secondary mb-1">
            <LayoutDashboard className="w-3 h-3" />
            Dashboards
          </div>
          <div className="text-lg font-semibold text-primary leading-none">{division.activeDashboards}</div>
        </div>
        <div className="text-center px-1">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-secondary mb-1">
            <Mail className="w-3 h-3" />
            Subscriptions
          </div>
          <div className="text-lg font-semibold text-primary leading-none">{division.activeSubscriptions}</div>
        </div>
        <div className="text-center px-1">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-secondary mb-1">
            <Flame className="w-3 h-3" />
            Demand
          </div>
          <div className="text-lg font-semibold text-primary leading-none">{demand}</div>
        </div>
      </div>

      {/* Engagement meter */}
      <div>
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.max(0, Math.min(100, division.engagementScore))}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-secondary">{recencyLabel(division.daysSinceActivity)}</p>
    </Link>
  );
}
