"use client";

import { useState, useCallback } from "react";
import { Pencil } from "lucide-react";
import { BrainEntityKind, DashboardStatus } from "@/lib/brain-types";

interface EditEntityFormProps {
  kind: BrainEntityKind;
  id: number;
  initialName: string;
  initialStakeholder: string | null;
  initialStatus: DashboardStatus;
  initialJiraTicketId: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

const ENTITY_ENDPOINTS: Record<BrainEntityKind, string> = {
  dashboard: "/api/dashboards",
  subscription: "/api/report-subscriptions",
};

const STATUS_OPTIONS: DashboardStatus[] = ["active", "maintenance", "retired"];

const STATUS_LABELS: Record<DashboardStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
};

export function EditEntityForm({
  kind,
  id,
  initialName,
  initialStakeholder,
  initialStatus,
  initialJiraTicketId,
  onSaved,
  onCancel,
}: EditEntityFormProps) {
  const [name, setName] = useState(initialName);
  const [stakeholder, setStakeholder] = useState(initialStakeholder ?? "");
  const [status, setStatus] = useState<DashboardStatus>(initialStatus);
  const [jiraTicketId, setJiraTicketId] = useState(initialJiraTicketId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError("Name is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(`${ENTITY_ENDPOINTS[kind]}/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            stakeholder: stakeholder.trim() ? stakeholder.trim() : null,
            status,
            jiraTicketId: jiraTicketId.trim() ? jiraTicketId.trim() : null,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? `Could not update ${kind}.`);
          return;
        }

        onSaved();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [kind, id, name, stakeholder, status, jiraTicketId, onSaved]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <Pencil className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none capitalize">
              Edit {kind}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Editing: {initialName}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityName" className="text-xs font-medium text-secondary">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="editEntityName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityStakeholder" className="text-xs font-medium text-secondary">
              Stakeholder
            </label>
            <input
              id="editEntityStakeholder"
              type="text"
              value={stakeholder}
              onChange={(e) => setStakeholder(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityStatus" className="text-xs font-medium text-secondary">
              Status
            </label>
            <select
              id="editEntityStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value as DashboardStatus)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editEntityJiraTicketId" className="text-xs font-medium text-secondary">
              Jira ticket ID
            </label>
            <input
              id="editEntityJiraTicketId"
              type="text"
              value={jiraTicketId}
              onChange={(e) => setJiraTicketId(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

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
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
