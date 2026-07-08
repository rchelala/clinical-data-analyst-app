// Pure, framework-free helpers for compiling and rendering an analyst's
// weekly status update. No React, no fetch — callers gather the data and
// pass it in. Mirrors mockup/worklist-mockup.html's buildStructured().

import { isoWeekRange, isDateWithin } from "@/lib/dates";

export interface WeeklyUpdateTask {
  title: string;
  status: string;
  createdDate: string;
  completedDate: string | null;
}

export interface WeeklyUpdateDashboard {
  name: string;
  priority: string | null;
  worklistStatus: string | null;
  tasks: WeeklyUpdateTask[];
}

export interface WeeklyUpdateAssignedTask {
  title: string;
  status: string;
  dashboardName: string;
  createdDate: string;
  completedDate: string | null;
}

export interface WeeklyUpdatePsq {
  division: string | null;
  name: string;
  status: string | null;
  tasks: WeeklyUpdateTask[];
}

export interface WeeklyUpdateData {
  analystName: string;
  meetings: string;
  dashboards: WeeklyUpdateDashboard[];
  assignedTasks: WeeklyUpdateAssignedTask[];
  psqs: WeeklyUpdatePsq[];
}

function formatTitleDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Builds a copy-ready Markdown weekly status update from compiled worklist
// data. Pure/deterministic aside from reading "now" for the title date and
// the recent-completion window — no network calls, no AI cost.
export function buildStructuredUpdate(data: WeeklyUpdateData): string {
  const { analystName, meetings, dashboards, assignedTasks, psqs } = data;

  // "This week" = current ISO week (Monday-Sunday, inclusive), computed from
  // local calendar date parts. Membership is a plain string comparison — see
  // lib/dates.ts for why that sidesteps the classic `new Date("YYYY-MM-DD")`
  // (UTC) vs. `new Date()` (local) timezone skew.
  const { startDate, endDate } = isoWeekRange();
  const inWeek = (dateStr: string | null) => isDateWithin(dateStr, startDate, endDate);

  let out = `# Weekly Update — ${analystName}\n_${formatTitleDate(new Date())}_\n\n`;

  if (meetings.trim()) {
    out += `**Meetings this week:** ${meetings.trim()}\n\n`;
  }

  out += `## Dashboards\n`;
  dashboards.forEach((dash) => {
    const priorityLabel = dash.priority ? `  ·  Priority ${dash.priority}` : "";
    const statusLabel = dash.worklistStatus ?? "—";
    out += `\n**${dash.name}** — ${statusLabel}${priorityLabel}\n`;

    // Open/in-progress tasks only count as "this week's activity" if they
    // were created this week — otherwise they're stale open work that
    // predates the window and no longer belongs in a weekly update.
    const active = dash.tasks.filter((t) => t.status !== "done" && inWeek(t.createdDate));
    const recentlyCompleted = dash.tasks.filter((t) => t.status === "done" && inWeek(t.completedDate));

    active.forEach((t) => {
      const box = t.status === "in_progress" || t.status === "progress" ? "~" : " ";
      out += `  - [${box}] ${t.title}\n`;
    });

    if (recentlyCompleted.length) {
      out += `  - ✓ Completed: ${recentlyCompleted.map((t) => t.title).join("; ")}\n`;
    }

    if (active.length === 0 && recentlyCompleted.length === 0) {
      out += `  - _No activity this week_\n`;
    }
  });

  out += `\n## PSQs\n`;
  if (psqs.length === 0) {
    out += `_No PSQs on file._\n`;
  } else {
    psqs.forEach((p) => {
      const label = p.division ? `${p.division} — ${p.name}` : p.name;
      const statusLabel = p.status ?? "—";
      out += `\n- **${label}** (${statusLabel})\n`;

      // Same rule as Dashboards: active tasks count only if created this
      // week, completed tasks count only if completed this week.
      const active = p.tasks.filter((t) => t.status !== "done" && inWeek(t.createdDate));
      const recentlyCompleted = p.tasks.filter((t) => t.status === "done" && inWeek(t.completedDate));

      active.forEach((t) => {
        const box = t.status === "in_progress" || t.status === "progress" ? "~" : " ";
        out += `  - [${box}] ${t.title}\n`;
      });

      if (recentlyCompleted.length) {
        out += `  - ✓ Completed: ${recentlyCompleted.map((t) => t.title).join("; ")}\n`;
      }

      if (active.length === 0 && recentlyCompleted.length === 0) {
        out += `  - _No activity this week_\n`;
      }
    });
  }

  // Same created-this-week / completed-this-week rule applies here: an
  // assigned task only surfaces if there was activity on it this week.
  const weekAssignedTasks = assignedTasks.filter((t) =>
    t.status === "done" ? inWeek(t.completedDate) : inWeek(t.createdDate)
  );

  if (weekAssignedTasks.length > 0) {
    out += `\n## Assigned to me\n`;
    weekAssignedTasks.forEach((t) => {
      out += `- [${t.status === "done" ? "x" : " "}] ${t.title} _(${t.dashboardName})_\n`;
    });
  }

  return out;
}
