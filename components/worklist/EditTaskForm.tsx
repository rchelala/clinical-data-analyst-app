"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil } from "lucide-react";
import { fetchAllAnalysts } from "@/lib/reference-data";
import { Analyst, Task } from "@/lib/brain-types";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";
import { toLocalDateString } from "@/lib/dates";

interface EditTaskFormProps {
  task: Task; // whole row — supplies id + every initial value
  targetLabel: string; // pre-rendered, e.g. "Dashboard: Safety Overview"
  statusSuggestions: string[];
  prioritySuggestions: string[];
  onSaved: (updated: Task) => void; // receives the PATCH response row
  onCancel: () => void;
}

// Formats a task's created/completed DATE for display. The value arrives as an
// ISO-ish string; take the calendar-date part so it isn't shifted by timezone.
// Mirrors the fmtDate helper in app/worklist/page.tsx (not imported from there
// per the task spec — this file must not touch page.tsx).
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return d.slice(0, 10);
}

export function EditTaskForm({
  task,
  targetLabel,
  statusSuggestions,
  prioritySuggestions,
  onSaved,
  onCancel,
}: EditTaskFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState<string | null>(task.priority);
  const [ownerAnalystId, setOwnerAnalystId] = useState<string>(
    task.ownerAnalystId !== null ? String(task.ownerAnalystId) : ""
  );
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate the owner dropdown. A failure here is non-fatal — the select
  // just shows "— Unassigned —" plus whatever the user leaves selected — so
  // we don't surface an error for it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Includes retired analysts: this select is seeded from the task's
        // existing owner, and an active-only list would render a retired one
        // as a blank option — indistinguishable from "— Unassigned —".
        const data = await fetchAllAnalysts();
        if (!cancelled) setAnalysts(data);
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

      const nextTitle = title.trim();
      if (!nextTitle) {
        setError("Title is required.");
        return;
      }

      const nextDescription = description.trim() ? description.trim() : null;
      const nextPriority = priority && priority.trim() ? priority.trim() : null;
      const nextOwner = ownerAnalystId === "" ? null : Number(ownerAnalystId);

      // Only changed fields go in the body. `undefined` keys are dropped by
      // JSON.stringify, so the route's read-then-merge keeps everything else —
      // and an untouched `status` never reaches the completed_date /
      // resolution_comment derivation at all.
      const fields = {
        title: nextTitle !== task.title ? nextTitle : undefined,
        description: nextDescription !== (task.description ?? null) ? nextDescription : undefined,
        status: status !== task.status ? status : undefined,
        priority: nextPriority !== (task.priority ?? null) ? nextPriority : undefined,
        ownerAnalystId: nextOwner !== (task.ownerAnalystId ?? null) ? nextOwner : undefined,
        // Mirrors statusPatchBody() in app/worklist/page.tsx: the server stamps
        // CURRENT_DATE in ITS timezone (UTC on Netlify), which can be the wrong
        // calendar day for the user, so a transition into 'done' must carry the
        // client's local date. Only sent on the transition — the route ignores
        // completedDate unless the row's old status was not already 'done'.
        completedDate:
          status !== task.status && status === "done" ? toLocalDateString(new Date()) : undefined,
      };

      // Nothing changed: skip the round-trip. The route 400s on an empty body
      // (route.ts:32-45), so this also avoids surfacing a bogus error.
      if (Object.values(fields).every((v) => v === undefined)) {
        onCancel();
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fields),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not save task.");
          return;
        }

        onSaved(data as Task);
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [title, description, status, priority, ownerAnalystId, task, onSaved, onCancel]
  );

  const showReopenWarning =
    task.status === "done" && status !== "done" && !!task.resolutionComment;

  const created = fmtDate(task.createdDate);
  const completed = fmtDate(task.completedDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <Pencil className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">Edit task</h2>
            <p className="text-xs text-secondary mt-0.5">Editing: {task.title}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-secondary">Target</label>
            <div className="text-sm text-primary px-3 py-2 rounded-md border border-theme bg-secondary-glass">
              {targetLabel}
            </div>
            <p className="text-[11px] text-secondary">
              Target can&apos;t be changed. Delete and re-create the task to move it.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editTaskTitle" className="text-xs font-medium text-secondary">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="editTaskTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editTaskDescription" className="text-xs font-medium text-secondary">
              Description
            </label>
            <textarea
              id="editTaskDescription"
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

          {showReopenWarning && (
            <p className="text-xs text-amber-400">
              Reopening this task clears its resolution note.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="editTaskAssignee" className="text-xs font-medium text-secondary">
              Assignee
            </label>
            <select
              id="editTaskAssignee"
              value={ownerAnalystId}
              onChange={(e) => setOwnerAnalystId(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              <option value="">— Unassigned —</option>
              {analysts.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.isActive}>
                  {a.isActive ? a.name : `${a.name} (retired)`}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-secondary">
            {created && <span>Created {created}</span>}
            {completed && <span>{created ? " · " : ""}Completed {completed}</span>}
          </p>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
