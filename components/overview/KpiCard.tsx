// Small presentational KPI tile for the Division Overview summary strip.
// Styled after clinkit-division-overview.html's `.sum-card` (uppercase
// label + icon, big number) but translated into this app's Eclipse
// Tailwind utilities (bg-panel/border-theme/text-secondary).

import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  // Renders the value in a danger/amber accent — used for "Open requests"
  // when there's a nonzero backlog needing attention.
  danger?: boolean;
}

export function KpiCard({ label, value, icon: Icon, danger }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-theme bg-panel px-4 py-3 shadow-panel">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`text-2xl font-semibold tracking-tight leading-none ${danger ? "text-amber-400" : "text-primary"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
