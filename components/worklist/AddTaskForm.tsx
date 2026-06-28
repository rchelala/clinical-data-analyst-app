"use client";

import { useState, useCallback, useEffect } from "react";
import { ClipboardPlus } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";

interface AddTaskFormProps {
  dashboardId: number;
  currentAnalystId: number;
  statusSuggestions: string[];
  prioritySuggestions: string[];
  onCreated: () => void;
  onCancel: () => void;
}

export function AddTaskForm({
  dashboardId,
  currentAnalystId,
  statusSuggestions,
  prioritySuggestions,
  onCreated,
  onCancel,
}: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState<string | null>(null);
  const [ownerAnalystId, setOwnerAnalystId] = useState<number>(currentAnalystId);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analysts");
        const data = await res.json();
        if (!cancelled && res.ok) setAnalysts(data);
      } catch {
        // Non-critical; assignee dropdown will just show the default option.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!title.trim()) {
        setError("Title is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-analyst-id": String(currentAnalystId),
          },
          body: JSON.stringify({
            dashboardId,
            title: title.trim(),
            description: description.trim() ? description.trim() : undefined,
            status,
            priority: priority ?? undefined,
            ownerAnalystId,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not create task.");
          return;
        }

        onCreated();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [title, description, status, priority, ownerAnalystId, dashboardId, currentAnalystId, onCreated]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">Add task</h2>
            <p className="text-xs text-secondary mt-0.5">Add a new task to this dashboard.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="taskTitle" className="text-xs font-medium text-secondary">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="taskTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="taskDescription" className="text-xs font-medium text-secondary">
              Description
            </label>
            <textarea
              id="taskDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-secondary">Status</label>
              <StatusPrioritySelect
                kind="status"
                value={status}
                suggestions={statusSuggestions}
                onChange={setStatus}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-secondary">Priority</label>
              <StatusPrioritySelect
                kind="priority"
                value={priority}
                suggestions={prioritySuggestions}
                onChange={setPriority}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="taskAssignee" className="text-xs font-medium text-secondary">
              Assignee
            </label>
            <select
              id="taskAssignee"
              value={ownerAnalystId}
              onChange={(e) => setOwnerAnalystId(Number(e.target.value))}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {analysts.length === 0 && (
                <option value={currentAnalystId}>Me</option>
              )}
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
