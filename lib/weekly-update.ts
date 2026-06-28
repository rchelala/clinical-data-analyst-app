// Pure, framework-free helpers for compiling and rendering an analyst's
// weekly status update. No React, no fetch — callers gather the data and
// pass it in. Mirrors mockup/worklist-mockup.html's buildStructured().

export interface WeeklyUpdateTask {
  title: string;
  status: string;
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
}

export interface WeeklyUpdatePsq {
  division: string | null;
  name: string;
  status: string | null;
  tasks: string | null;
  comments: string | null;
}

export interface WeeklyUpdateData {
  analystName: string;
  meetings: string;
  dashboards: WeeklyUpdateDashboard[];
  assignedTasks: WeeklyUpdateAssignedTask[];
  psqs: WeeklyUpdatePsq[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// True if `dateString` falls within the last 7 days (inclusive of today).
// Used to decide which completed tasks surface in the "✓ Completed" line —
// older completions are assumed to already be reported in a prior update.
export function isWithinLastNDays(dateString: string | null, days = 7): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= days * MS_PER_DAY;
}

function formatTitleDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Builds a copy-ready Markdown weekly status update from compiled worklist
// data. Pure/deterministic aside from reading "now" for the title date and
// the recent-completion window — no network calls, no AI cost.
export function buildStructuredUpdate(data: WeeklyUpdateData): string {
  const { analystName, meetings, dashboards, assignedTasks, psqs } = data;

  let out = `# Weekly Update — ${analystName}\n_${formatTitleDate(new Date())}_\n\n`;

  if (meetings.trim()) {
    out += `**Meetings this week:** ${meetings.trim()}\n\n`;
  }

  out += `## Dashboards\n`;
  dashboards.forEach((dash) => {
    const priorityLabel = dash.priority ? `  ·  Priority ${dash.priority}` : "";
    const statusLabel = dash.worklistStatus ?? "—";
    out += `\n**${dash.name}** — ${statusLabel}${priorityLabel}\n`;

    const active = dash.tasks.filter((t) => t.status !== "done");
    const recentlyCompleted = dash.tasks.filter(
      (t) => t.status === "done" && isWithinLastNDays(t.completedDate)
    );

    active.forEach((t) => {
      const box = t.status === "in_progress" || t.status === "progress" ? "~" : " ";
      out += `  - [${box}] ${t.title}\n`;
    });

    if (recentlyCompleted.length) {
      out += `  - ✓ Completed: ${recentlyCompleted.map((t) => t.title).join("; ")}\n`;
    }

    if (active.length === 0 && recentlyCompleted.length === 0) {
      out += `  - _No open tasks_\n`;
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
      const detail = [p.tasks, p.comments].filter(Boolean).join("  —  ");
      if (detail) out += `  ${detail}\n`;
    });
  }

  if (assignedTasks.length > 0) {
    out += `\n## Assigned to me\n`;
    assignedTasks.forEach((t) => {
      out += `- [${t.status === "done" ? "x" : " "}] ${t.title} _(${t.dashboardName})_\n`;
    });
  }

  return out;
}
