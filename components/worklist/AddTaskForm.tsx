"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ClipboardPlus } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";

interface AddTaskFormProps {
  currentAnalystId: number;
  statusSuggestions: string[];
  prioritySuggestions: string[];
  onCreated: () => void;
  onCancel: () => void;
  lockedDashboardId?: number; // when set, target is locked to this dashboard, picker not interactive
  lockedSubscriptionId?: number; // when set, target is locked to this report subscription, picker not interactive
  lockedPsqId?: number; // when set, target is locked to this PSQ, picker not interactive
}

type TargetType = "dashboard" | "subscription" | "division" | "psq";

interface TargetOption {
  id: number;
  name: string;
}

export function AddTaskForm({
  currentAnalystId,
  statusSuggestions,
  prioritySuggestions,
  onCreated,
  onCancel,
  lockedDashboardId,
  lockedSubscriptionId,
  lockedPsqId,
}: AddTaskFormProps) {
  const isLocked =
    lockedDashboardId !== undefined ||
    lockedSubscriptionId !== undefined ||
    lockedPsqId !== undefined;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState<string | null>(null);
  const [ownerAnalystId, setOwnerAnalystId] = useState<number>(currentAnalystId);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<TargetType>(
    lockedPsqId !== undefined
      ? "psq"
      : lockedSubscriptionId !== undefined
      ? "subscription"
      : "dashboard"
  );
  const [targetId, setTargetId] = useState<number | null>(
    lockedPsqId ?? lockedSubscriptionId ?? lockedDashboardId ?? null
  );
  const [optionsByType, setOptionsByType] = useState<Record<TargetType, TargetOption[] | undefined>>({
    dashboard: undefined,
    subscription: undefined,
    division: undefined,
    psq: undefined,
  });
  const [optionsLoading, setOptionsLoading] = useState<Record<TargetType, boolean>>({
    dashboard: false,
    subscription: false,
    division: false,
    psq: false,
  });

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

  const fetchOptionsFor = useCallback(
    async (type: TargetType) => {
      setOptionsLoading((prev) => ({ ...prev, [type]: true }));
      try {
        let url: string;
        let headers: Record<string, string> | undefined;
        if (type === "dashboard") {
          url = "/api/dashboards";
          headers = { "x-analyst-id": String(currentAnalystId) };
        } else if (type === "subscription") {
          url = "/api/report-subscriptions";
          headers = { "x-analyst-id": String(currentAnalystId) };
        } else if (type === "psq") {
          url = `/api/psqs?analystId=${currentAnalystId}`;
        } else {
          url = "/api/divisions";
        }
        const res = await fetch(url, headers ? { headers } : undefined);
        const data = await res.json();
        if (res.ok) {
          if (type === "psq") {
            setOptionsByType((prev) => ({
              ...prev,
              psq: data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })),
            }));
          } else {
            setOptionsByType((prev) => ({ ...prev, [type]: data }));
          }
        }
      } catch {
        // Non-critical; dropdown will just be empty.
      } finally {
        setOptionsLoading((prev) => ({ ...prev, [type]: false }));
      }
    },
    [currentAnalystId]
  );

  // When locked, fetch the dashboard list once to resolve the dashboard's
  // display name (falls back to showing nothing extra if not found).
  useEffect(() => {
    if (lockedDashboardId !== undefined && optionsByType.dashboard === undefined) {
      fetchOptionsFor("dashboard");
    }
  }, [lockedDashboardId, optionsByType.dashboard, fetchOptionsFor]);

  // When locked to a subscription, fetch the subscription list once to resolve its name.
  useEffect(() => {
    if (lockedSubscriptionId !== undefined && optionsByType.subscription === undefined) {
      fetchOptionsFor("subscription");
    }
  }, [lockedSubscriptionId, optionsByType.subscription, fetchOptionsFor]);

  // When locked to a PSQ, fetch the PSQ list once to resolve its display name.
  useEffect(() => {
    if (lockedPsqId !== undefined && optionsByType.psq === undefined) {
      fetchOptionsFor("psq");
    }
  }, [lockedPsqId, optionsByType.psq, fetchOptionsFor]);

  // Load the initial (default) target type's options on open when not locked —
  // otherwise the first-shown "Dashboard" dropdown stays empty until the user
  // toggles to another target and back.
  useEffect(() => {
    if (!isLocked && optionsByType[targetType] === undefined) {
      fetchOptionsFor(targetType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockedDashboardName = useMemo(() => {
    if (lockedDashboardId === undefined) return null;
    const list = optionsByType.dashboard;
    if (!list) return null;
    return list.find((d) => d.id === lockedDashboardId)?.name ?? null;
  }, [lockedDashboardId, optionsByType.dashboard]);

  const lockedSubscriptionName = useMemo(() => {
    if (lockedSubscriptionId === undefined) return null;
    const list = optionsByType.subscription;
    if (!list) return null;
    return list.find((s) => s.id === lockedSubscriptionId)?.name ?? null;
  }, [lockedSubscriptionId, optionsByType.subscription]);

  const lockedPsqName = useMemo(() => {
    if (lockedPsqId === undefined) return null;
    const list = optionsByType.psq;
    if (!list) return null;
    return list.find((p) => p.id === lockedPsqId)?.name ?? null;
  }, [lockedPsqId, optionsByType.psq]);

  const handleSelectTargetType = useCallback(
    (type: TargetType) => {
      if (isLocked) return;
      setTargetType(type);
      setTargetId(null);
      if (optionsByType[type] === undefined) {
        fetchOptionsFor(type);
      }
    },
    [isLocked, optionsByType, fetchOptionsFor]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!title.trim()) {
        setError("Title is required.");
        return;
      }

      if (targetId === null) {
        setError("Please select a target.");
        return;
      }

      setSubmitting(true);
      try {
        const body: Record<string, unknown> = {
          title: title.trim(),
          description: description.trim() ? description.trim() : undefined,
          status,
          priority: priority ?? undefined,
          ownerAnalystId,
        };
        if (targetType === "dashboard") body.dashboardId = targetId;
        else if (targetType === "subscription") body.subscriptionId = targetId;
        else if (targetType === "division") body.divisionId = targetId;
        else body.psqId = targetId;

        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-analyst-id": String(currentAnalystId),
          },
          body: JSON.stringify(body),
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
    [title, description, status, priority, ownerAnalystId, targetType, targetId, currentAnalystId, onCreated]
  );

  const currentOptions = optionsByType[targetType];
  const currentLoading = optionsLoading[targetType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">Add task</h2>
            <p className="text-xs text-secondary mt-0.5">
              {lockedPsqId !== undefined
                ? "Add a new task to this PSQ."
                : lockedSubscriptionId !== undefined
                ? "Add a new task to this report subscription."
                : isLocked
                ? "Add a new task to this dashboard."
                : "Add a new task."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-secondary">Target</label>
            {isLocked ? (
              <div className="text-sm text-primary px-3 py-2 rounded-md border border-theme bg-secondary-glass">
                {lockedPsqId !== undefined
                  ? `PSQ: ${lockedPsqName ?? lockedPsqId}`
                  : lockedSubscriptionId !== undefined
                  ? `Report Subscription: ${lockedSubscriptionName ?? lockedSubscriptionId}`
                  : `Dashboard: ${lockedDashboardName ?? lockedDashboardId}`}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { type: "dashboard" as const, label: "Dashboard" },
                      { type: "subscription" as const, label: "Report Subscription" },
                      { type: "division" as const, label: "Division" },
                      { type: "psq" as const, label: "PSQ" },
                    ]
                  ).map(({ type, label }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSelectTargetType(type)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        targetType === type
                          ? "bg-brand-600 text-white"
                          : "bg-panel border border-theme text-secondary hover:text-primary hover:bg-panel/80"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  value={targetId ?? ""}
                  onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
                  disabled={currentLoading}
                  className="mt-1 text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors disabled:opacity-60"
                >
                  <option value="">
                    {currentLoading ? "Loading…" : "Select…"}
                  </option>
                  {(currentOptions ?? []).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

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
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-panel/80 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-shimmer px-3 py-1.5 text-xs font-semibold rounded-md disabled:opacity-60 hover:brightness-110 transition-all duration-200"
            >
              {submitting ? "Creating…" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
