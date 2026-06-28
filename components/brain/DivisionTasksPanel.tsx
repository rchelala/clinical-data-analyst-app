"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, ListTodo } from "lucide-react";
import { Analyst, Task } from "@/lib/brain-types";

interface DivisionTasksPanelProps {
  divisionId: number;
  divisionName: string;
  onClose: () => void;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString();
}

// Lightweight status->dot-color mapping for the read-only task chips in this
// panel. Mirrors the same subset used in RequestSidePanel (kept duplicated
// rather than shared, since RequestSidePanel doesn't export these helpers).
const TASK_STATUS_DOT_COLORS: Record<string, string> = {
  open: "bg-[#da3633]",
  in_progress: "bg-[#d29922]",
  progress: "bg-[#d29922]",
  done: "bg-[#6b7785]",
  completed: "bg-[#6b7785]",
};

function taskStatusDotColor(status: string): string {
  return TASK_STATUS_DOT_COLORS[status.toLowerCase().trim()] ?? "bg-[#9aa7b4]";
}

function taskStatusLabel(status: string): string {
  return status
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function DivisionTasksPanel({ divisionId, divisionName, onClose }: DivisionTasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  // All analysts, fetched once when the panel opens, used to resolve a
  // task's ownerAnalystId to a display name. Degrades silently on failure.
  const [allAnalysts, setAllAnalysts] = useState<Analyst[]>([]);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);

    (async () => {
      try {
        const res = await fetch(`/api/tasks?divisionId=${divisionId}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setTasksError(data.error ?? "Could not load tasks.");
          return;
        }

        setTasks(data);
      } catch {
        if (!cancelled) setTasksError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [divisionId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/analysts");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) return;
        setAllAnalysts(data);
      } catch {
        // Silently degrade — assignee names just won't resolve.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const analystNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const analyst of allAnalysts) map.set(analyst.id, analyst.name);
    return map;
  }, [allAnalysts]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative h-full w-full sm:w-96 bg-panel border-l border-theme shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-theme flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">{divisionName}</h2>
            <p className="text-xs text-secondary mt-0.5">Standalone division tasks</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-md border border-theme bg-panel hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <ListTodo className="w-3.5 h-3.5 text-secondary" />
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">Tasks</h3>
          </div>

          {tasksLoading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
              <p className="text-sm text-secondary">Loading tasks…</p>
            </div>
          )}

          {!tasksLoading && tasksError && (
            <p className="text-sm text-red-600 dark:text-red-400">{tasksError}</p>
          )}

          {!tasksLoading && !tasksError && tasks.length === 0 && (
            <p className="text-sm text-secondary">No standalone tasks in this division.</p>
          )}

          {!tasksLoading && !tasksError && tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-theme px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-primary">{task.title}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${taskStatusDotColor(task.status)}`} />
                      <span className="text-xs text-secondary whitespace-nowrap">
                        {taskStatusLabel(task.status)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-secondary">
                    <span>
                      Assignee:{" "}
                      {task.ownerAnalystId !== null
                        ? analystNameById.get(task.ownerAnalystId) ?? "Unknown"
                        : "Unassigned"}
                    </span>
                    <span>·</span>
                    <span>Created: {formatDate(task.createdDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
