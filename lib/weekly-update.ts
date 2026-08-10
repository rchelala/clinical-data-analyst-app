// Pure, framework-free helpers for compiling and rendering an analyst's
// weekly status update. No React, no fetch — callers gather the data and
// pass it in. Mirrors mockup/worklist-mockup.html's buildStructured().

import { trailingDayRange, isDateWithin } from "@/lib/dates";

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

  // "This week" for completions = the trailing 7 days ending today (today plus
  // the prior six), so a report written on any day — including a Monday —
  // captures the week of work that just happened rather than an ISO week that
  // has barely started. Membership is a plain string comparison — see
  // lib/dates.ts for why that sidesteps the classic `new Date("YYYY-MM-DD")`
  // (UTC) vs. `new Date()` (local) timezone skew.
  const { startDate, endDate } = trailingDayRange(7);
  const completedThisWeek = (dateStr: string | null) => isDateWithin(dateStr, startDate, endDate);

  let out = `# Weekly Update — ${analystName}\n_${formatTitleDate(new Date())}_\n\n`;

  if (meetings.trim()) {
    out += `**Meetings this week:** ${meetings.trim()}\n\n`;
  }

  out += `## Dashboards\n`;
  dashboards.forEach((dash) => {
    const priorityLabel = dash.priority ? `  ·  Priority ${dash.priority}` : "";
    const statusLabel = dash.worklistStatus ?? "—";
    out += `\n**${dash.name}** — ${statusLabel}${priorityLabel}\n`;

    // Open/in-progress tasks are outstanding work regardless of when they were
    // created, so they all belong in the update. Completed tasks only count if
    // they were finished within the trailing-7-day window.
    const active = dash.tasks.filter((t) => t.status !== "done");
    const recentlyCompleted = dash.tasks.filter((t) => t.status === "done" && completedThisWeek(t.completedDate));

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

      // Same rule as Dashboards: all open tasks are outstanding work, completed
      // tasks count only if finished within the trailing-7-day window.
      const active = p.tasks.filter((t) => t.status !== "done");
      const recentlyCompleted = p.tasks.filter((t) => t.status === "done" && completedThisWeek(t.completedDate));

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

  // Same rule as above: open assigned tasks always surface as outstanding
  // work, completed ones only if finished within the trailing-7-day window.
  const weekAssignedTasks = assignedTasks.filter((t) =>
    t.status === "done" ? completedThisWeek(t.completedDate) : true
  );

  if (weekAssignedTasks.length > 0) {
    out += `\n## Assigned to me\n`;
    weekAssignedTasks.forEach((t) => {
      out += `- [${t.status === "done" ? "x" : " "}] ${t.title} _(${t.dashboardName})_\n`;
    });
  }

  return out;
}
