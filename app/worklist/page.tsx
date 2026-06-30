"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Home,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Trash2,
  Loader2,
  CalendarDays,
  BrainCircuit,
} from "lucide-react";
import { AnalystSelector } from "@/components/brain/AnalystSelector";
import { AddTaskForm } from "@/components/worklist/AddTaskForm";
import { AddWorklistDashboard } from "@/components/worklist/AddWorklistDashboard";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";
import { WeeklyUpdateDrawer } from "@/components/worklist/WeeklyUpdateDrawer";
import { loadAnalystId } from "@/lib/analyst-identity";
import { Dashboard, Division, PsqWithTaskCount, ReportSubscription, Task, TaskWithContext } from "@/lib/brain-types";
import { WeeklyUpdateData } from "@/lib/weekly-update";

interface WorklistDashboardItem extends Dashboard {
  ownerName: string | null;
  isCovering: boolean;
  activeTaskCount: number;
  totalTaskCount: number;
}

interface WorklistSubscriptionItem extends ReportSubscription {
  ownerName: string | null;
  isCovering: boolean;
  activeTaskCount: number;
  totalTaskCount: number;
}

type WorklistItemKind = "dashboard" | "subscription";

// Unified view-model for a row in the "My Dashboards / Report Subscriptions"
// section. Dashboards and report subscriptions share the same worklist columns
// (priority, worklistStatus, comments, notes, summary, enterpriseAnalyst), so
// they render through one shape, discriminated by `kind` for routing PATCH and
// task-fetch calls to the right endpoint.
interface WorklistItem {
  kind: WorklistItemKind;
  id: number;
  name: string;
  priority: string | null;
  worklistStatus: string | null;
  enterpriseAnalyst: string | null;
  comments: string | null;
  notes: string | null;
  summary: string | null;
  ownerName: string | null;
  isCovering: boolean;
  activeTaskCount: number;
  totalTaskCount: number;
}

// Composite key so dashboard and subscription ids (separate sequences that can
// collide numerically) never clash in the per-item task maps / expanded state.
function itemKey(kind: WorklistItemKind, id: number): string {
  return `${kind}:${id}`;
}

// Computes the ISO Monday (YYYY-MM-DD) of the week containing `date`.
function getIsoMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

// Natural sort for free-form priority strings: numeric values first
// (ascending), then non-numeric values alphabetically, nulls/empties last.
function comparePriority(a: string | null, b: string | null): number {
  const aEmpty = a === null || a.trim() === "";
  const bEmpty = b === null || b.trim() === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  const aIsNum = Number.isFinite(aNum);
  const bIsNum = Number.isFinite(bNum);

  if (aIsNum && bIsNum) return aNum - bNum;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return a!.localeCompare(b!);
}

export default function WorklistPage() {
  const [analystId, setAnalystId] = useState<number | null>(null);
  const [analystName, setAnalystName] = useState<string>("");

  // Meetings banner
  const [meetings, setMeetings] = useState<string>("");
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const weekStart = useMemo(() => getIsoMonday(new Date()), []);

  // Dashboards + report subscriptions (rendered together in one section)
  const [dashboards, setDashboards] = useState<WorklistDashboardItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<WorklistSubscriptionItem[]>([]);
  const [dashboardsLoading, setDashboardsLoading] = useState(true);
  const [dashboardsError, setDashboardsError] = useState<string | null>(null);
  const [sortByPriority, setSortByPriority] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [dashboardsExpanded, setDashboardsExpanded] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [tasksByItem, setTasksByItem] = useState<Record<string, Task[]>>({});
  const [tasksLoading, setTasksLoading] = useState<Record<string, boolean>>({});
  const [showAddTaskFor, setShowAddTaskFor] = useState<{ kind: WorklistItemKind; id: number } | null>(null);
  const [showAddTopLevelTask, setShowAddTopLevelTask] = useState(false);
  const [showAddDashboard, setShowAddDashboard] = useState(false);

  // Weekly update drawer
  const [weeklyUpdateData, setWeeklyUpdateData] = useState<WeeklyUpdateData | null>(null);
  const [weeklyUpdateLoading, setWeeklyUpdateLoading] = useState(false);
  const [weeklyUpdateError, setWeeklyUpdateError] = useState<string | null>(null);

  // Assigned to me
  const [assignedTasks, setAssignedTasks] = useState<TaskWithContext[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(true);

  // PSQs
  const [psqs, setPsqs] = useState<PsqWithTaskCount[]>([]);
  const [psqsLoading, setPsqsLoading] = useState(true);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [psqActiveOnly, setPsqActiveOnly] = useState(true);
  const [expandedPsqId, setExpandedPsqId] = useState<number | null>(null);
  const [tasksByPsq, setTasksByPsq] = useState<Record<number, Task[]>>({});
  const [psqTasksLoading, setPsqTasksLoading] = useState<Record<number, boolean>>({});
  const [showAddTaskForPsq, setShowAddTaskForPsq] = useState<number | null>(null);

  const handleSelectAnalyst = useCallback((id: number, name: string) => {
    setAnalystId(id);
    setAnalystName(name);
  }, []);

  // Bootstrap from stored identity in case AnalystSelector hasn't resolved yet
  // (mirrors how /brain reads it, kept here defensively in case of race).
  useEffect(() => {
    const stored = loadAnalystId();
    if (stored !== null) setAnalystId((prev) => prev ?? stored);
  }, []);

  // Fetch meetings banner
  const refetchMeetings = useCallback(async () => {
    if (analystId === null) return;
    setMeetingsLoaded(false);
    try {
      const res = await fetch(`/api/weekly-notes?analystId=${analystId}&weekStart=${weekStart}`);
      const data = await res.json();
      if (res.ok) {
        setMeetings(data?.meetings ?? "");
      }
    } catch {
      // Non-critical
    } finally {
      setMeetingsLoaded(true);
    }
  }, [analystId, weekStart]);

  useEffect(() => {
    refetchMeetings();
  }, [refetchMeetings]);

  const handleMeetingsBlur = useCallback(
    async (value: string) => {
      if (analystId === null) return;
      try {
        await fetch("/api/weekly-notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analystId, weekStart, meetings: value.trim() ? value.trim() : null }),
        });
      } catch {
        // Non-critical
      }
    },
    [analystId, weekStart]
  );

  // Fetch the analyst's worklist dashboards AND owned report subscriptions in
  // parallel — both render in the unified section below.
  const refetchDashboards = useCallback(async () => {
    if (analystId === null) return;
    setDashboardsLoading(true);
    setDashboardsError(null);
    try {
      const [dashRes, subRes] = await Promise.all([
        fetch(`/api/worklist-dashboards?analystId=${analystId}`),
        fetch(`/api/worklist-subscriptions?analystId=${analystId}`),
      ]);
      const dashData = await dashRes.json();
      if (!dashRes.ok) {
        setDashboardsError(dashData.error ?? "Could not load dashboards.");
        return;
      }
      setDashboards(dashData);
      // Subscriptions are supplementary — degrade gracefully rather than
      // blocking the whole section if that fetch fails.
      if (subRes.ok) {
        setSubscriptions(await subRes.json());
      }
    } catch {
      setDashboardsError("Network error — could not reach the server.");
    } finally {
      setDashboardsLoading(false);
    }
  }, [analystId]);

  useEffect(() => {
    refetchDashboards();
  }, [refetchDashboards]);

  // Fetch assigned-to-me tasks
  const refetchAssigned = useCallback(async () => {
    if (analystId === null) return;
    setAssignedLoading(true);
    try {
      const res = await fetch(`/api/tasks?assignedTo=${analystId}&excludeWorklistOf=${analystId}`);
      const data = await res.json();
      if (res.ok) setAssignedTasks(data);
    } catch {
      // Non-critical
    } finally {
      setAssignedLoading(false);
    }
  }, [analystId]);

  useEffect(() => {
    refetchAssigned();
  }, [refetchAssigned]);

  // Fetch PSQs
  const refetchPsqs = useCallback(async () => {
    if (analystId === null) return;
    setPsqsLoading(true);
    try {
      const res = await fetch(`/api/psqs?analystId=${analystId}`);
      const data = await res.json();
      if (res.ok) setPsqs(data);
    } catch {
      // Non-critical
    } finally {
      setPsqsLoading(false);
    }
  }, [analystId]);

  useEffect(() => {
    refetchPsqs();
  }, [refetchPsqs]);

  // Fetch divisions (for PSQ division names + picker)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/divisions");
        const data = await res.json();
        if (!cancelled && res.ok) setDivisions(data);
      } catch {
        // Non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const divisionNameById = useMemo(() => {
    const map = new Map<number, string>();
    divisions.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [divisions]);

  const fetchTasksForItem = useCallback(
    async (kind: WorklistItemKind, id: number) => {
      if (analystId === null) return;
      const key = itemKey(kind, id);
      setTasksLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const param = kind === "dashboard" ? `dashboardId=${id}` : `subscriptionId=${id}`;
        const res = await fetch(`/api/tasks?${param}&ownerAnalystId=${analystId}`);
        const data = await res.json();
        if (res.ok) {
          setTasksByItem((prev) => ({ ...prev, [key]: data }));
        }
      } catch {
        // Non-critical
      } finally {
        setTasksLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [analystId]
  );

  const toggleExpand = useCallback(
    (kind: WorklistItemKind, id: number) => {
      const key = itemKey(kind, id);
      if (expandedKey === key) {
        setExpandedKey(null);
        return;
      }
      setExpandedKey(key);
      if (!tasksByItem[key]) {
        fetchTasksForItem(kind, id);
      }
    },
    [expandedKey, tasksByItem, fetchTasksForItem]
  );

  const patchItem = useCallback(
    async (kind: WorklistItemKind, id: number, body: Record<string, unknown>) => {
      try {
        const endpoint = kind === "dashboard" ? `/api/dashboards/${id}` : `/api/report-subscriptions/${id}`;
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          if (kind === "dashboard") {
            setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
          } else {
            setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
          }
        }
      } catch {
        // Non-critical; UI will simply not reflect the change until refetch.
      }
    },
    []
  );

  const patchTask = useCallback(
    async (key: string, taskId: number, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setTasksByItem((prev) => ({
            ...prev,
            [key]: (prev[key] ?? []).map((t) => (t.id === taskId ? updated : t)),
          }));
        }
      } catch {
        // Non-critical
      }
    },
    []
  );

  // Shared task deletion: confirms (destructive — also removes the node from
  // the galaxy/brain), DELETEs, then runs the caller's local-state updater.
  const deleteTask = useCallback(
    async (taskId: number, onSuccess: () => void) => {
      if (!window.confirm("Delete this task? This cannot be undone and removes it from the galaxy.")) return;
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
        if (res.ok) onSuccess();
      } catch {
        // Non-critical
      }
    },
    []
  );

  const deleteItemTask = useCallback(
    (key: string, taskId: number) => {
      deleteTask(taskId, () => {
        setTasksByItem((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).filter((t) => t.id !== taskId),
        }));
        // Refresh active-task counts so the row can drop out under "Active only".
        refetchDashboards();
      });
    },
    [deleteTask, refetchDashboards]
  );

  const deletePsqTask = useCallback(
    (psqId: number, taskId: number) => {
      deleteTask(taskId, () => {
        setTasksByPsq((prev) => ({
          ...prev,
          [psqId]: (prev[psqId] ?? []).filter((t) => t.id !== taskId),
        }));
        refetchPsqs();
      });
    },
    [deleteTask, refetchPsqs]
  );

  const deleteAssignedTask = useCallback(
    (taskId: number) => {
      deleteTask(taskId, () => {
        setAssignedTasks((prev) => prev.filter((t) => t.id !== taskId));
      });
    },
    [deleteTask]
  );

  const patchAssignedTask = useCallback(
    async (taskId: number, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setAssignedTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t))
          );
        }
      } catch {
        // Non-critical
      }
    },
    []
  );

  const fetchTasksForPsq = useCallback(
    async (psqId: number) => {
      if (analystId === null) return;
      setPsqTasksLoading((prev) => ({ ...prev, [psqId]: true }));
      try {
        const res = await fetch(`/api/tasks?psqId=${psqId}&ownerAnalystId=${analystId}`);
        const data = await res.json();
        if (res.ok) {
          setTasksByPsq((prev) => ({ ...prev, [psqId]: data }));
        }
      } catch {
        // Non-critical
      } finally {
        setPsqTasksLoading((prev) => ({ ...prev, [psqId]: false }));
      }
    },
    [analystId]
  );

  const togglePsqExpand = useCallback(
    (psqId: number) => {
      if (expandedPsqId === psqId) {
        setExpandedPsqId(null);
        return;
      }
      setExpandedPsqId(psqId);
      if (!tasksByPsq[psqId]) {
        fetchTasksForPsq(psqId);
      }
    },
    [expandedPsqId, tasksByPsq, fetchTasksForPsq]
  );

  const patchPsqTask = useCallback(
    async (psqId: number, taskId: number, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setTasksByPsq((prev) => ({
            ...prev,
            [psqId]: (prev[psqId] ?? []).map((t) => (t.id === taskId ? updated : t)),
          }));
        }
      } catch {
        // Non-critical
      }
    },
    []
  );

  const psqTaskCounts = useCallback(
    (psqId: number) => {
      const tasks = tasksByPsq[psqId];
      if (!tasks) return null;
      const open = tasks.filter((t) => t.status !== "done").length;
      return `${open} open · ${tasks.length} total`;
    },
    [tasksByPsq]
  );

  const patchPsq = useCallback(async (id: number, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/psqs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setPsqs((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } catch {
      // Non-critical
    }
  }, []);

  const handleRemoveFromWorklist = useCallback(
    async (dashboardId: number) => {
      if (analystId === null) return;
      try {
        const res = await fetch(
          `/api/worklist-dashboards?analystId=${analystId}&dashboardId=${dashboardId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setDashboards((prev) => prev.filter((d) => d.id !== dashboardId));
          if (expandedKey === itemKey("dashboard", dashboardId)) setExpandedKey(null);
        }
      } catch {
        // Non-critical
      }
    },
    [analystId, expandedKey]
  );

  // PSQs are worklist-only (no Brain representation), so deleting a row removes
  // the PSQ itself; its tasks cascade. Confirm first since it's destructive.
  const handleDeletePsq = useCallback(
    async (psqId: number) => {
      if (!window.confirm("Delete this PSQ and its tasks? This cannot be undone.")) return;
      try {
        const res = await fetch(`/api/psqs/${psqId}`, { method: "DELETE" });
        if (res.ok) {
          setPsqs((prev) => prev.filter((p) => p.id !== psqId));
          if (expandedPsqId === psqId) setExpandedPsqId(null);
        }
      } catch {
        // Non-critical
      }
    },
    [expandedPsqId]
  );

  const handleAddPsq = useCallback(async () => {
    if (analystId === null) return;
    try {
      const res = await fetch("/api/psqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analystId, name: "New PSQ", year: new Date().getFullYear(), summary: null }),
      });
      const data = await res.json();
      if (res.ok) {
        setPsqs((prev) => [data, ...prev]);
      }
    } catch {
      // Non-critical
    }
  }, [analystId]);

  // Unified list of dashboards + report subscriptions for the main section.
  const items = useMemo<WorklistItem[]>(() => {
    const fromDashboards: WorklistItem[] = dashboards.map((d) => ({
      kind: "dashboard",
      id: d.id,
      name: d.name,
      priority: d.priority,
      worklistStatus: d.worklistStatus,
      enterpriseAnalyst: d.enterpriseAnalyst,
      comments: d.comments,
      notes: d.notes,
      summary: d.summary,
      ownerName: d.ownerName,
      isCovering: d.isCovering,
      activeTaskCount: d.activeTaskCount,
      totalTaskCount: d.totalTaskCount,
    }));
    const fromSubscriptions: WorklistItem[] = subscriptions.map((s) => ({
      kind: "subscription",
      id: s.id,
      name: s.name,
      priority: s.priority,
      worklistStatus: s.worklistStatus,
      enterpriseAnalyst: s.enterpriseAnalyst,
      comments: s.comments,
      notes: s.notes,
      summary: s.summary,
      ownerName: s.ownerName,
      isCovering: s.isCovering,
      activeTaskCount: s.activeTaskCount,
      totalTaskCount: s.totalTaskCount,
    }));
    return [...fromDashboards, ...fromSubscriptions];
  }, [dashboards, subscriptions]);

  const statusSuggestions = useMemo(() => {
    const set = new Set<string>(["active", "in_progress", "done", "maintenance", "open"]);
    items.forEach((i) => i.worklistStatus && set.add(i.worklistStatus));
    Object.values(tasksByItem)
      .flat()
      .forEach((t) => t.status && set.add(t.status));
    Object.values(tasksByPsq)
      .flat()
      .forEach((t) => t.status && set.add(t.status));
    assignedTasks.forEach((t) => t.status && set.add(t.status));
    psqs.forEach((p) => p.status && set.add(p.status));
    return Array.from(set);
  }, [items, tasksByItem, tasksByPsq, assignedTasks, psqs]);

  const prioritySuggestions = useMemo(() => {
    const set = new Set<string>(["1", "2", "3", "4", "5"]);
    items.forEach((i) => i.priority && set.add(i.priority));
    Object.values(tasksByItem)
      .flat()
      .forEach((t) => t.priority && set.add(t.priority));
    Object.values(tasksByPsq)
      .flat()
      .forEach((t) => t.priority && set.add(t.priority));
    return Array.from(set);
  }, [items, tasksByItem, tasksByPsq]);

  const sortedItems = useMemo(() => {
    // "Active only" is purely status-driven: show items whose Status column
    // (worklistStatus) is "active" (free-form, matched case-insensitively),
    // regardless of how many open tasks they have.
    const filtered = activeOnly
      ? items.filter((i) => (i.worklistStatus ?? "").trim().toLowerCase() === "active")
      : items;
    if (!sortByPriority) return filtered;
    return [...filtered].sort((a, b) => comparePriority(a.priority, b.priority));
  }, [items, sortByPriority, activeOnly]);

  const sortedPsqs = useMemo(() => {
    return psqActiveOnly ? psqs.filter((p) => p.activeTaskCount > 0) : psqs;
  }, [psqs, psqActiveOnly]);

  const existingWorklistDashboardIds = useMemo(() => dashboards.map((d) => d.id), [dashboards]);

  const taskCounts = useCallback(
    (item: WorklistItem) => {
      // Prefer the live, already-fetched task list when the row is expanded so
      // the count reflects in-row edits/deletes immediately; otherwise fall
      // back to the counts the list endpoint returns, so the count always
      // shows without needing to expand.
      const tasks = tasksByItem[itemKey(item.kind, item.id)];
      if (tasks) {
        const open = tasks.filter((t) => t.status !== "done").length;
        return `${open} open · ${tasks.length} total`;
      }
      return `${item.activeTaskCount} open · ${item.totalTaskCount} total`;
    },
    [tasksByItem]
  );

  // Compiles WeeklyUpdateData for the drawer. Fetches tasks for every
  // worklist dashboard AND report subscription in parallel (not just the
  // currently expanded one) so the update reflects everything, then opens
  // the drawer.
  const handleGenerateWeeklyUpdate = useCallback(async () => {
    if (analystId === null) return;
    setWeeklyUpdateLoading(true);
    setWeeklyUpdateError(null);
    try {
      const results = await Promise.all(
        items.map(async (item) => {
          const key = itemKey(item.kind, item.id);
          // Reuse already-fetched tasks if this item happens to be expanded.
          const cached = tasksByItem[key];
          if (cached) return { item, tasks: cached };
          try {
            const param = item.kind === "dashboard" ? `dashboardId=${item.id}` : `subscriptionId=${item.id}`;
            const res = await fetch(`/api/tasks?${param}&ownerAnalystId=${analystId}`);
            const data = await res.json();
            return { item, tasks: res.ok ? (data as Task[]) : [] };
          } catch {
            return { item, tasks: [] as Task[] };
          }
        })
      );

      const data: WeeklyUpdateData = {
        analystName,
        meetings,
        dashboards: results.map(({ item, tasks }) => ({
          name: item.kind === "subscription" ? `${item.name} (subscription)` : item.name,
          priority: item.priority,
          worklistStatus: item.worklistStatus,
          tasks: tasks.map((t) => ({
            title: t.title,
            status: t.status,
            completedDate: t.completedDate,
          })),
        })),
        assignedTasks: assignedTasks.map((t) => ({
          title: t.title,
          status: t.status,
          dashboardName: t.contextName,
        })),
        psqs: psqs.map((p) => ({
          division: p.divisionId !== null ? divisionNameById.get(p.divisionId) ?? null : null,
          name: p.name,
          status: p.status,
          tasks: p.tasks,
          comments: p.comments,
        })),
      };

      setWeeklyUpdateData(data);
    } catch {
      setWeeklyUpdateError("Could not compile weekly update.");
    } finally {
      setWeeklyUpdateLoading(false);
    }
  }, [analystId, analystName, meetings, items, tasksByItem, assignedTasks, psqs, divisionNameById]);

  return (
    <div className="flex flex-col min-h-screen bg-primary">
      <div className="fixed inset-0 -z-10 bg-[#0d1117]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,#525252,transparent)]" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Home className="w-3 h-3" />
            Home
          </Link>
          <Link
            href="/brain"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <BrainCircuit className="w-3 h-3" />
            Galaxy
          </Link>
          <div>
            <h1 className="text-base font-semibold text-primary leading-none">Analyst Worklist</h1>
            <p className="text-xs text-secondary mt-0.5">Weekly status · dashboards · tasks · PSQs</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={analystId === null || weeklyUpdateLoading}
            onClick={handleGenerateWeeklyUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {weeklyUpdateLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            Generate Weekly Update
          </button>
          <AnalystSelector onSelect={handleSelectAnalyst} />
        </div>
      </header>

      <main className="flex-1 px-6 pb-20">
        {analystId === null ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-secondary">Select an analyst to view your worklist.</p>
          </div>
        ) : (
          <>
            {/* Meetings banner */}
            <div className="mt-4 rounded-lg border border-theme bg-panel px-4 py-3.5">
              <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-secondary font-medium">
                <CalendarDays className="w-3 h-3" />
                Meetings this week
              </label>
              {meetingsLoaded ? (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const value = e.currentTarget.innerText;
                    setMeetings(value);
                    handleMeetingsBlur(value);
                  }}
                  className="mt-1.5 text-sm text-primary outline-none rounded-md px-2 py-1.5 border border-transparent hover:border-theme hover:bg-secondary-glass focus:border-brand-500 focus:bg-secondary-glass transition-colors min-h-[1.5em]"
                >
                  {meetings}
                </div>
              ) : (
                <div className="mt-1.5 h-6 flex items-center">
                  <Loader2 className="w-3.5 h-3.5 text-secondary animate-spin" />
                </div>
              )}
            </div>

            {/* My Dashboards / Report Subscriptions */}
            <section className="mt-6">
              <div className="flex items-center gap-3 mb-2.5">
                <button
                  type="button"
                  onClick={() => setDashboardsExpanded((e) => !e)}
                  className="text-secondary hover:text-primary transition-colors"
                  aria-label={dashboardsExpanded ? "Collapse section" : "Expand section"}
                >
                  {dashboardsExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <h2 className="text-sm font-semibold text-primary">My Dashboards / Report Subscriptions</h2>
                <span className="text-xs text-secondary bg-panel border border-theme rounded-full px-2 py-0.5">
                  showing {sortedItems.length} of {items.length} item{items.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveOnly((a) => !a)}
                  className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    activeOnly
                      ? "text-primary border-brand-500 bg-brand-600/10"
                      : "border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Active only
                </button>
                <button
                  type="button"
                  onClick={() => setSortByPriority((s) => !s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    sortByPriority
                      ? "text-primary border-brand-500 bg-brand-600/10"
                      : "border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  ↑↓ Sort by priority
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTopLevelTask(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDashboard(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Dashboard
                </button>
              </div>

              <div className={`rounded-lg border border-theme bg-panel overflow-hidden ${dashboardsExpanded ? "" : "hidden"}`}>
                {dashboardsLoading && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                  </div>
                )}

                {!dashboardsLoading && dashboardsError && (
                  <p className="text-sm text-red-500 px-4 py-6 text-center">{dashboardsError}</p>
                )}

                {!dashboardsLoading && !dashboardsError && items.length === 0 && (
                  <p className="text-sm text-secondary px-4 py-8 text-center">
                    Nothing here yet — click &ldquo;+ Dashboard&rdquo; to add a dashboard to your worklist.
                    Report subscriptions you own appear here automatically.
                  </p>
                )}

                {!dashboardsLoading && !dashboardsError && items.length > 0 && (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-secondary-glass border-b border-theme">
                        {["Priority", "Dashboard / Subscription", "Tasks", "Status", "Enterprise Analyst", "Comments", "Notes", "Summary", ""].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left text-[10.5px] uppercase tracking-wide text-secondary font-semibold px-3 py-2 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((item) => {
                        const key = itemKey(item.kind, item.id);
                        const isOpen = expandedKey === key;
                        const counts = taskCounts(item);
                        return (
                          <Fragment key={key}>
                            <tr className="border-b border-theme/60 hover:bg-white/[0.02] align-top">
                              <td className="px-3 py-2.5">
                                <StatusPrioritySelect
                                  kind="priority"
                                  value={item.priority}
                                  suggestions={prioritySuggestions}
                                  onChange={(value) => patchItem(item.kind, item.id, { priority: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-primary text-sm">{item.name}</div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {item.kind === "subscription" && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded-full px-2 py-0.5">
                                      Subscription
                                    </span>
                                  )}
                                  {item.isCovering && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                                      Covering{item.ownerName ? ` · ${item.ownerName}` : ""}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.kind, item.id)}
                                  className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
                                >
                                  <ChevronRight
                                    className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                                  />
                                  {counts}
                                </button>
                              </td>
                              <td className="px-3 py-2.5">
                                <StatusPrioritySelect
                                  kind="status"
                                  value={item.worklistStatus}
                                  suggestions={statusSuggestions}
                                  onChange={(value) => patchItem(item.kind, item.id, { worklistStatus: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={item.enterpriseAnalyst}
                                  onSave={(value) => patchItem(item.kind, item.id, { enterpriseAnalyst: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={item.comments}
                                  onSave={(value) => patchItem(item.kind, item.id, { comments: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={item.notes}
                                  onSave={(value) => patchItem(item.kind, item.id, { notes: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={item.summary}
                                  onSave={(value) => patchItem(item.kind, item.id, { summary: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                {item.kind === "dashboard" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromWorklist(item.id)}
                                    title="Remove from worklist"
                                    className="text-secondary hover:text-red-500 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="bg-black/20 border-b border-theme/60">
                                <td colSpan={9} className="px-3 py-3 pl-10">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] uppercase tracking-wide text-secondary font-medium">
                                      Tasks — {item.name}
                                    </span>
                                  </div>

                                  {tasksLoading[key] && (
                                    <div className="flex items-center gap-2 text-xs text-secondary py-2">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Loading tasks…
                                    </div>
                                  )}

                                  {!tasksLoading[key] && (tasksByItem[key]?.length ?? 0) === 0 && (
                                    <p className="text-xs text-secondary py-2">No tasks yet.</p>
                                  )}

                                  {!tasksLoading[key] &&
                                    (tasksByItem[key] ?? []).map((task) => (
                                      <div
                                        key={task.id}
                                        className="flex items-start gap-2.5 px-2.5 py-2 mb-1.5 rounded-md border border-theme/60 bg-panel"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            patchTask(key, task.id, {
                                              status: task.status === "done" ? "open" : "done",
                                            })
                                          }
                                          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center text-[10px] transition-colors ${
                                            task.status === "done"
                                              ? "bg-green-500 border-green-500 text-black"
                                              : "border-secondary"
                                          }`}
                                        >
                                          {task.status === "done" ? "✓" : ""}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <div
                                            className={`text-[13px] font-medium ${
                                              task.status === "done"
                                                ? "line-through text-secondary"
                                                : "text-primary"
                                            }`}
                                          >
                                            {task.title}
                                          </div>
                                          {task.description && (
                                            <div className="text-xs text-secondary mt-0.5">{task.description}</div>
                                          )}
                                          <div className="flex items-center gap-2 mt-1.5">
                                            <StatusPrioritySelect
                                              kind="status"
                                              value={task.status}
                                              suggestions={statusSuggestions}
                                              onChange={(value) => patchTask(key, task.id, { status: value })}
                                            />
                                            <StatusPrioritySelect
                                              kind="priority"
                                              value={task.priority}
                                              suggestions={prioritySuggestions}
                                              onChange={(value) => patchTask(key, task.id, { priority: value })}
                                            />
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => deleteItemTask(key, task.id)}
                                          title="Delete task"
                                          className="mt-0.5 text-secondary hover:text-red-500 transition-colors flex-shrink-0"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}

                                  <button
                                    type="button"
                                    onClick={() => setShowAddTaskFor({ kind: item.kind, id: item.id })}
                                    className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary border border-dashed border-theme rounded-md px-3 py-1.5 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Task
                                  </button>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Assigned to me */}
            {!assignedLoading && assignedTasks.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center gap-3 mb-2.5">
                  <h2 className="text-sm font-semibold text-primary">Assigned to me</h2>
                  <span className="text-xs text-secondary bg-panel border border-theme rounded-full px-2 py-0.5">
                    {assignedTasks.length} task{assignedTasks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="rounded-lg border border-theme bg-panel overflow-hidden">
                  <ul className="divide-y divide-theme/60">
                    {assignedTasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-primary font-medium">{task.title}</div>
                          {task.description && (
                            <div className="text-xs text-secondary mt-0.5 whitespace-pre-wrap">
                              {task.description}
                            </div>
                          )}
                          <div className="text-xs text-secondary mt-0.5">
                            {task.contextType === "dashboard" && `on dashboard ${task.contextName}`}
                            {task.contextType === "subscription" && `on subscription ${task.contextName}`}
                            {task.contextType === "division" && `in division ${task.contextName}`}
                            {task.contextOwnerName ? ` · owned by ${task.contextOwnerName}` : ""}
                          </div>
                        </div>
                        <StatusPrioritySelect
                          kind="status"
                          value={task.status}
                          suggestions={statusSuggestions}
                          onChange={(value) => patchAssignedTask(task.id, { status: value })}
                        />
                        <button
                          type="button"
                          onClick={() => deleteAssignedTask(task.id)}
                          title="Delete task"
                          className="text-secondary hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* PSQ */}
            <section className="mt-6">
              <div className="flex items-center gap-3 mb-2.5">
                <h2 className="text-sm font-semibold text-primary">PSQ — Performance &amp; Service Quality</h2>
                <span className="text-xs text-secondary bg-panel border border-theme rounded-full px-2 py-0.5">
                  showing {sortedPsqs.length} of {psqs.length} PSQ{psqs.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setPsqActiveOnly((a) => !a)}
                  className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    psqActiveOnly
                      ? "text-primary border-brand-500 bg-brand-600/10"
                      : "border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Active only
                </button>
                <button
                  type="button"
                  onClick={handleAddPsq}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  PSQ
                </button>
              </div>

              <div className="rounded-lg border border-theme bg-panel overflow-hidden">
                {psqsLoading && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                  </div>
                )}

                {!psqsLoading && psqs.length === 0 && (
                  <p className="text-sm text-secondary px-4 py-8 text-center">
                    No PSQs yet — click &ldquo;+ PSQ&rdquo; to add one.
                  </p>
                )}

                {!psqsLoading && psqs.length > 0 && (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-secondary-glass border-b border-theme">
                        {[
                          "Status",
                          "Year",
                          "Division",
                          "PSQ",
                          "Tasks",
                          "Dashboard",
                          "Comments",
                          "Enterprise Analyst",
                          "Notes",
                          "Summary",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left text-[10.5px] uppercase tracking-wide text-secondary font-semibold px-3 py-2 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                        <th key="actions" className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPsqs.map((p) => {
                        const isPsqOpen = expandedPsqId === p.id;
                        const psqCounts = psqTaskCounts(p.id);
                        return (
                          <Fragment key={p.id}>
                            <tr className="border-b border-theme/60 hover:bg-white/[0.02] align-top">
                              <td className="px-3 py-2.5">
                                <StatusPrioritySelect
                                  kind="status"
                                  value={p.status}
                                  suggestions={statusSuggestions}
                                  onChange={(value) => patchPsq(p.id, { status: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={p.year !== null ? String(p.year) : null}
                                  onSave={(value) => patchPsq(p.id, { year: value ? Number(value) : null })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={p.divisionId ?? ""}
                                  onChange={(e) =>
                                    patchPsq(p.id, {
                                      divisionId: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  className="text-xs rounded-md border border-theme px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer transition-colors"
                                >
                                  <option value="">–</option>
                                  {divisions.map((div) => (
                                    <option key={div.id} value={div.id}>
                                      {div.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={p.name}
                                  placeholder="PSQ measure…"
                                  onSave={(value) => patchPsq(p.id, { name: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => togglePsqExpand(p.id)}
                                  className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
                                >
                                  <ChevronRight
                                    className={`w-3.5 h-3.5 transition-transform ${isPsqOpen ? "rotate-90" : ""}`}
                                  />
                                  {psqCounts ?? "View tasks"}
                                </button>
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={p.dashboardId ?? ""}
                                  onChange={(e) =>
                                    patchPsq(p.id, {
                                      dashboardId: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  className="text-xs rounded-md border border-theme px-2 py-1 bg-panel text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer transition-colors"
                                >
                                  <option value="">–</option>
                                  {dashboards.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={p.comments}
                                  onSave={(value) => patchPsq(p.id, { comments: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={p.enterpriseAnalyst}
                                  onSave={(value) => patchPsq(p.id, { enterpriseAnalyst: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell value={p.notes} onSave={(value) => patchPsq(p.id, { notes: value })} />
                              </td>
                              <td className="px-3 py-2.5">
                                <EditableCell
                                  value={p.summary}
                                  onSave={(value) => patchPsq(p.id, { summary: value })}
                                />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePsq(p.id)}
                                  title="Delete PSQ"
                                  className="text-secondary hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                            {isPsqOpen && (
                              <tr className="bg-black/20 border-b border-theme/60">
                                <td colSpan={11} className="px-3 py-3 pl-10">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] uppercase tracking-wide text-secondary font-medium">
                                      Tasks — {p.name}
                                    </span>
                                  </div>

                                  {psqTasksLoading[p.id] && (
                                    <div className="flex items-center gap-2 text-xs text-secondary py-2">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Loading tasks…
                                    </div>
                                  )}

                                  {!psqTasksLoading[p.id] && (tasksByPsq[p.id]?.length ?? 0) === 0 && (
                                    <p className="text-xs text-secondary py-2">No tasks yet.</p>
                                  )}

                                  {!psqTasksLoading[p.id] &&
                                    (tasksByPsq[p.id] ?? []).map((task) => (
                                      <div
                                        key={task.id}
                                        className="flex items-start gap-2.5 px-2.5 py-2 mb-1.5 rounded-md border border-theme/60 bg-panel"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            patchPsqTask(p.id, task.id, {
                                              status: task.status === "done" ? "open" : "done",
                                            })
                                          }
                                          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center text-[10px] transition-colors ${
                                            task.status === "done"
                                              ? "bg-green-500 border-green-500 text-black"
                                              : "border-secondary"
                                          }`}
                                        >
                                          {task.status === "done" ? "✓" : ""}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <div
                                            className={`text-[13px] font-medium ${
                                              task.status === "done"
                                                ? "line-through text-secondary"
                                                : "text-primary"
                                            }`}
                                          >
                                            {task.title}
                                          </div>
                                          {task.description && (
                                            <div className="text-xs text-secondary mt-0.5">{task.description}</div>
                                          )}
                                          <div className="flex items-center gap-2 mt-1.5">
                                            <StatusPrioritySelect
                                              kind="status"
                                              value={task.status}
                                              suggestions={statusSuggestions}
                                              onChange={(value) => patchPsqTask(p.id, task.id, { status: value })}
                                            />
                                            <StatusPrioritySelect
                                              kind="priority"
                                              value={task.priority}
                                              suggestions={prioritySuggestions}
                                              onChange={(value) => patchPsqTask(p.id, task.id, { priority: value })}
                                            />
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => deletePsqTask(p.id, task.id)}
                                          title="Delete task"
                                          className="mt-0.5 text-secondary hover:text-red-500 transition-colors flex-shrink-0"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}

                                  <button
                                    type="button"
                                    onClick={() => setShowAddTaskForPsq(p.id)}
                                    className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary border border-dashed border-theme rounded-md px-3 py-1.5 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Task
                                  </button>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {showAddTaskFor !== null && analystId !== null && (
        <AddTaskForm
          lockedDashboardId={showAddTaskFor.kind === "dashboard" ? showAddTaskFor.id : undefined}
          lockedSubscriptionId={showAddTaskFor.kind === "subscription" ? showAddTaskFor.id : undefined}
          currentAnalystId={analystId}
          statusSuggestions={statusSuggestions}
          prioritySuggestions={prioritySuggestions}
          onCreated={() => {
            const target = showAddTaskFor;
            setShowAddTaskFor(null);
            fetchTasksForItem(target.kind, target.id);
            refetchDashboards();
            refetchAssigned();
          }}
          onCancel={() => setShowAddTaskFor(null)}
        />
      )}

      {showAddTaskForPsq !== null && analystId !== null && (
        <AddTaskForm
          lockedPsqId={showAddTaskForPsq}
          currentAnalystId={analystId}
          statusSuggestions={statusSuggestions}
          prioritySuggestions={prioritySuggestions}
          onCreated={() => {
            const psqId = showAddTaskForPsq;
            setShowAddTaskForPsq(null);
            fetchTasksForPsq(psqId);
            refetchPsqs();
          }}
          onCancel={() => setShowAddTaskForPsq(null)}
        />
      )}

      {showAddTopLevelTask && analystId !== null && (
        <AddTaskForm
          currentAnalystId={analystId}
          statusSuggestions={statusSuggestions}
          prioritySuggestions={prioritySuggestions}
          onCreated={() => {
            setShowAddTopLevelTask(false);
            refetchDashboards();
            refetchAssigned();
          }}
          onCancel={() => setShowAddTopLevelTask(false)}
        />
      )}

      {showAddDashboard && analystId !== null && (
        <AddWorklistDashboard
          currentAnalystId={analystId}
          existingWorklistDashboardIds={existingWorklistDashboardIds}
          onAdded={() => {
            setShowAddDashboard(false);
            refetchDashboards();
          }}
          onCancel={() => setShowAddDashboard(false)}
        />
      )}

      {weeklyUpdateData && (
        <WeeklyUpdateDrawer data={weeklyUpdateData} onClose={() => setWeeklyUpdateData(null)} />
      )}

      {weeklyUpdateError && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-400 shadow-lg">
          {weeklyUpdateError}
          <button
            type="button"
            onClick={() => setWeeklyUpdateError(null)}
            className="text-red-400 hover:text-red-300"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

interface EditableCellProps {
  value: string | null;
  placeholder?: string;
  onSave: (value: string) => void;
}

// Inline-editable cell: shows current value as plain text, becomes
// contentEditable on focus, saves on blur. Matches the mockup's
// .edit-cell affordance.
function EditableCell({ value, placeholder, onSave }: EditableCellProps) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onSave(e.currentTarget.innerText.trim())}
      data-placeholder={placeholder}
      className="text-xs text-secondary outline-none rounded-md px-1.5 py-1 border border-transparent hover:border-theme hover:bg-secondary-glass focus:border-brand-500 focus:bg-secondary-glass focus:text-primary transition-colors min-h-[1.4em] min-w-[40px] empty:before:content-[attr(data-placeholder)] empty:before:text-secondary/50"
    >
      {value ?? ""}
    </div>
  );
}
