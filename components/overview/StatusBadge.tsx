// Small pill badge for dashboard/subscription/request/task statuses across
// the Division Detail page. Mirrors the badge conventions already
// established by DivisionEngagementCard's engagement-tier pill and
// app/brain/unassigned's status coloring: emerald=active/done, amber=warm/
// maintenance/in-progress, red=open, gray=retired/dormant.

import { DashboardStatus, RequestStatus } from "@/lib/brain-types";

const DASHBOARD_STATUS_LABEL: Record<DashboardStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
};

const DASHBOARD_STATUS_CLASSNAME: Record<DashboardStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  maintenance: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  retired: "bg-white/5 text-secondary border-theme",
};

export function DashboardStatusBadge({ status }: { status: DashboardStatus }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${DASHBOARD_STATUS_CLASSNAME[status]}`}
    >
      {DASHBOARD_STATUS_LABEL[status]}
    </span>
  );
}

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

const REQUEST_STATUS_CLASSNAME: Record<RequestStatus, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/30",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${REQUEST_STATUS_CLASSNAME[status]}`}
    >
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}

// Task status is free-form text (no DB enum — see brain-types.ts's Task
// comment), so this badge classifies loosely by substring rather than an
// exact lookup table. "done"/"complete" reads as success, anything with
// "progress" reads as in-flight, everything else defaults to the open/red
// treatment so outstanding work stays visually prominent.
export function TaskStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  let className = "bg-red-500/10 text-red-400 border-red-500/30";
  if (normalized.includes("done") || normalized.includes("complete")) {
    className = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  } else if (normalized.includes("progress") || normalized.includes("hold")) {
    className = "bg-amber-500/10 text-amber-400 border-amber-500/30";
  }
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${className}`}
    >
      {status}
    </span>
  );
}

// Small initials chip echoing the reference mockup's avatar-xs — a cheap
// per-row "who" affordance without needing real avatar images.
export function OwnerChip({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-secondary">—</span>;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-1.5 text-secondary">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-semibold text-brand-400">
        {initials}
      </span>
      {name}
    </div>
  );
}
