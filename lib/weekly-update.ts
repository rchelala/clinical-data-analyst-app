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

// Report subscriptions carry the same fields as dashboards; they are kept in a
// separate list only so the update can render them under their own heading.
export type WeeklyUpdateSubscription = WeeklyUpdateDashboard;

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
  subscriptions: WeeklyUpdateSubscription[];
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
  const { analystName, meetings, dashboards, subscriptions, assignedTasks, psqs } = data;

  // "This week" for completions = the trailing 7 days ending today (today plus
  // the prior six), so a report written on any day — including a Monday —
  // captures the week of work that just happened rather than an ISO week that
  // has barely started. Membership is a plain string comparison — see
  // lib/dates.ts for why that sidesteps the classic `new Date("YYYY-MM-DD")`
  // (UTC) vs. `new Date()` (local) timezone skew.
  const { startDate, endDate } = trailingDayRange(7);
  const completedThisWeek = (dateStr: string | null) => isDateWithin(dateStr, startDate, endDate);

  // One entry — a dashboard, a report subscription, or a PSQ — rendered as a
  // bolded heading line plus its task lines. All three used to inline the same
  // logic; they share it here so the open/completed rules can only drift in one
  // place.
  const renderEntry = (heading: string, tasks: WeeklyUpdateTask[]): string => {
    let block = `\n${heading}\n`;

    // Open/in-progress tasks are outstanding work regardless of when they were
    // created, so they all belong in the update. Completed tasks only count if
    // they were finished within the trailing-7-day window.
    const active = tasks.filter((t) => t.status !== "done");
    const recentlyCompleted = tasks.filter((t) => t.status === "done" && completedThisWeek(t.completedDate));

    active.forEach((t) => {
      const box = t.status === "in_progress" || t.status === "progress" ? "~" : " ";
      block += `  - [${box}] ${t.title}\n`;
    });

    if (recentlyCompleted.length) {
      block += `  - ✓ Completed: ${recentlyCompleted.map((t) => t.title).join("; ")}\n`;
    }

    if (active.length === 0 && recentlyCompleted.length === 0) {
      block += `  - _No activity this week_\n`;
    }

    return block;
  };

  const entryHeading = (name: string, status: string | null, priority: string | null): string => {
    const priorityLabel = priority ? `  ·  Priority ${priority}` : "";
    return `**${name}** — ${status ?? "—"}${priorityLabel}`;
  };

  let out = `# Weekly Update — ${analystName}\n_${formatTitleDate(new Date())}_\n\n`;

  // Every section below prints its heading unconditionally, even when empty.
  // The AI rewrite mirrors this structure verbatim, and a fixed set of headings
  // in a fixed order is what makes the update scannable week over week.
  out += `## Meetings this week\n${meetings.trim() || "_None recorded._"}\n`;

  out += `\n## Dashboards\n`;
  if (dashboards.length === 0) {
    out += `_No dashboards on the worklist._\n`;
  } else {
    dashboards.forEach((dash) => {
      out += renderEntry(entryHeading(dash.name, dash.worklistStatus, dash.priority), dash.tasks);
    });
  }

  out += `\n## Report Subscriptions\n`;
  if (subscriptions.length === 0) {
    out += `_No report subscriptions on the worklist._\n`;
  } else {
    subscriptions.forEach((sub) => {
      out += renderEntry(entryHeading(sub.name, sub.worklistStatus, sub.priority), sub.tasks);
    });
  }

  // Same rule as the entries above: open assigned tasks always surface as
  // outstanding work, completed ones only if finished within the trailing-7-day
  // window. Grouped by parent name (dashboard, subscription, or division) so the
  // update reads "USNWR:" followed by that project's tickets.
  const weekAssignedTasks = assignedTasks.filter((t) =>
    t.status === "done" ? completedThisWeek(t.completedDate) : true
  );

  out += `\n## Tasks assigned to me\n`;
  if (weekAssignedTasks.length === 0) {
    out += `_No assigned tasks this week._\n`;
  } else {
    const byParent = new Map<string, WeeklyUpdateAssignedTask[]>();
    weekAssignedTasks.forEach((t) => {
      const parent = t.dashboardName?.trim() || "Other";
      const group = byParent.get(parent);
      if (group) group.push(t);
      else byParent.set(parent, [t]);
    });

    byParent.forEach((tasks, parent) => {
      out += `\n**${parent}**\n`;
      tasks.forEach((t) => {
        out += `  - [${t.status === "done" ? "x" : " "}] ${t.title}\n`;
      });
    });
  }

  out += `\n## PSQs\n`;
  if (psqs.length === 0) {
    out += `_No PSQs on file._\n`;
  } else {
    psqs.forEach((p) => {
      const label = p.division ? `${p.division} — ${p.name}` : p.name;
      out += renderEntry(entryHeading(label, p.status, null), p.tasks);
    });
  }

  return out;
}
