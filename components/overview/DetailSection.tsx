// Shared section chrome for the Division Detail page's four data tables
// (dashboards, subscriptions, requests, tasks). Translates the reference
// mockup's `.section` / `.section-head` / `.data-table` look into this
// app's Eclipse Tailwind utilities — header with icon + title + count
// pill, optional tab bar, and a horizontally-scrollable table body so wide
// tables never blow out the page's horizontal scroll.

import type { LucideIcon } from "lucide-react";

interface DetailSectionProps {
  icon: LucideIcon;
  title: string;
  count: number;
  tabs?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailSection({ icon: Icon, title, count, tabs, children }: DetailSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 pb-2 mb-3 border-b border-theme">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Icon className="w-3.5 h-3.5 text-secondary" />
          {title}
        </div>
        <span className="text-[11px] text-secondary bg-white/5 px-2 py-0.5 rounded-md">
          {count} total
        </span>
      </div>
      {tabs && <div className="flex items-center gap-1.5 mb-3">{tabs}</div>}
      <div className="rounded-lg border border-theme bg-panel overflow-x-auto shadow-panel">
        {children}
      </div>
    </section>
  );
}

interface SectionTabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function SectionTab({ label, active, onClick }: SectionTabProps) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
        active
          ? "bg-white/10 border-white/20 text-primary"
          : "border-theme text-secondary hover:text-primary hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-xs text-secondary px-4 py-6 text-center">
        {message}
      </td>
    </tr>
  );
}

export const TH_CLASS =
  "text-left text-[10px] font-semibold uppercase tracking-wide text-secondary px-4 pt-3 pb-2 whitespace-nowrap";
export const TD_CLASS = "px-4 py-2.5 border-t border-white/5 text-xs align-middle";
