"use client";

import { useState, useCallback } from "react";
import { ClipboardPlus } from "lucide-react";
import { DashboardWithUrgency, RequestType } from "@/lib/brain-types";

interface AddRequestFormProps {
  dashboards: DashboardWithUrgency[];
  currentAnalystId: number;
  onCreated: () => void;
  onCancel: () => void;
}

const REQUEST_TYPE_OPTIONS: { value: RequestType; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "field_request", label: "Field request" },
];

export function AddRequestForm({
  dashboards,
  currentAnalystId,
  onCreated,
  onCancel,
}: AddRequestFormProps) {
  const [dashboardId, setDashboardId] = useState<string>(
    dashboards[0] ? String(dashboards[0].id) : ""
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("feature");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const parsedDashboardId = Number(dashboardId);
      if (!dashboardId || !Number.isFinite(parsedDashboardId)) {
        setError("Please select a dashboard.");
        return;
      }
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-analyst-id": String(currentAnalystId),
          },
          body: JSON.stringify({
            dashboardId: parsedDashboardId,
            title: title.trim(),
            description: description.trim() ? description.trim() : undefined,
            requestType,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not create request.");
          return;
        }

        onCreated();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [dashboardId, title, description, requestType, currentAnalystId, onCreated]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Add request
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Log a new request against a dashboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard" className="text-xs font-medium text-secondary">
              Dashboard <span className="text-red-500">*</span>
            </label>
            <select
              id="dashboard"
              value={dashboardId}
              onChange={(e) => setDashboardId(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {dashboards.length === 0 && <option value="">No dashboards available</option>}
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-xs font-medium text-secondary">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-xs font-medium text-secondary">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="requestType" className="text-xs font-medium text-secondary">
              Request type
            </label>
            <select
              id="requestType"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors"
            >
              {REQUEST_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              disabled={submitting || dashboards.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
