"use client";

import { useState, useCallback } from "react";
import { ClipboardPlus } from "lucide-react";
import { BrainEntityKind, CreatedBrainEntity, Division } from "@/lib/brain-types";

interface AddEntityFormProps {
  // The division currently being viewed — pre-filled, not user-selectable.
  // Optional so callers without an already-selected division (e.g. the
  // intake "convert" flow, where the intake row's divisionId may be null)
  // can instead pass `divisions` and let the user pick one in-form.
  division?: Division | null;
  // Full division list to render a picker from when `division` isn't
  // already known. Ignored if `division` is provided.
  divisions?: Division[];
  currentAnalystId?: number | null;
  dashboardsInDivision: { id: number; name: string }[];
  // Optional prefill values, used by the intake "convert" flow to seed the
  // form from an existing intake_requests row. All optional; existing
  // callers that don't pass these get the original blank-form behavior.
  initialKind?: BrainEntityKind;
  initialName?: string;
  initialStakeholder?: string;
  initialJiraTicketId?: string;
  // Called after a successful create. The created entity's id/kind are
  // passed so callers that need to react to *what* was created (e.g. the
  // intake convert flow, which must then call POST .../convert) can do so.
  // Existing callers that declare a zero-arg callback continue to work
  // unchanged — the extra argument is simply ignored by them.
  onCreated: (entity: CreatedBrainEntity) => void;
  onCancel: () => void;
}

const ENTITY_ENDPOINTS: Record<BrainEntityKind, string> = {
  dashboard: "/api/dashboards",
  subscription: "/api/report-subscriptions",
};

export function AddEntityForm({
  division = null,
  divisions = [],
  currentAnalystId = null,
  dashboardsInDivision,
  initialKind,
  initialName,
  initialStakeholder,
  initialJiraTicketId,
  onCreated,
  onCancel,
}: AddEntityFormProps) {
  const [kind, setKind] = useState<BrainEntityKind>(initialKind ?? "dashboard");
  const [name, setName] = useState(initialName ?? "");
  const [stakeholder, setStakeholder] = useState(initialStakeholder ?? "");
  const [jiraTicketId, setJiraTicketId] = useState(initialJiraTicketId ?? "");
  const [linkedDashboardId, setLinkedDashboardId] = useState("");
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(
    division ? String(division.id) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When a fixed `division` prop is supplied, that's always the source of
  // truth and there's no picker. Otherwise the user must choose one from
  // `divisions` before submitting.
  const effectiveDivisionId = division ? division.id : (selectedDivisionId ? Number(selectedDivisionId) : null);
  const effectiveDivisionName = division ? division.name : (divisions.find((d) => d.id === effectiveDivisionId)?.name ?? null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError("Name is required.");
        return;
      }

      if (effectiveDivisionId === null) {
        setError("Division is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(ENTITY_ENDPOINTS[kind], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            divisionId: effectiveDivisionId,
            analystId: currentAnalystId ?? undefined,
            stakeholder: stakeholder.trim() ? stakeholder.trim() : undefined,
            jiraTicketId: jiraTicketId.trim() ? jiraTicketId.trim() : undefined,
            linkedDashboardId: linkedDashboardId ? Number(linkedDashboardId) : undefined,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? `Could not create ${kind}.`);
          return;
        }

        onCreated({ id: data.id, kind });
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [kind, name, stakeholder, jiraTicketId, linkedDashboardId, effectiveDivisionId, currentAnalystId, onCreated]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Add dashboard or subscription
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {effectiveDivisionName ? `Adding to: ${effectiveDivisionName}` : "Choose a division below"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {!division && (
            <div className="flex flex-col gap-1">
              <label htmlFor="entityDivision" className="text-xs font-medium text-secondary">
                Division <span className="text-red-500">*</span>
              </label>
              <select
                id="entityDivision"
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                required
                className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="">Select a division…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
              {divisions.length === 0 && (
                <p className="text-[11px] text-secondary mt-1">
                  No divisions found — create one first.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-secondary">Type</label>
            <div className="flex gap-2">
              {(["dashboard", "subscription"] as BrainEntityKind[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors capitalize ${
                    kind === option
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "border-theme text-secondary hover:text-primary hover:bg-panel/80"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entityName" className="text-xs font-medium text-secondary">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="entityName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entityStakeholder" className="text-xs font-medium text-secondary">
              Stakeholder
            </label>
            <input
              id="entityStakeholder"
              type="text"
              value={stakeholder}
              onChange={(e) => setStakeholder(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entityJiraTicketId" className="text-xs font-medium text-secondary">
              Jira ticket
            </label>
            <input
              id="entityJiraTicketId"
              type="text"
              value={jiraTicketId}
              onChange={(e) => setJiraTicketId(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {kind === "subscription" && dashboardsInDivision.length > 0 && (
            // Hidden entirely (rather than shown with only a "None" option)
            // when the caller has no dashboard list for this division —
            // e.g. the intake convert flow currently passes [] here since
            // it has no per-division dashboard fetch. An empty-but-visible
            // dropdown would look broken rather than like a deliberate
            // "nothing to link yet" state.
            <div className="flex flex-col gap-1">
              <label htmlFor="entityLinkedDashboard" className="text-xs font-medium text-secondary">
                Link to dashboard (optional)
              </label>
              <select
                id="entityLinkedDashboard"
                value={linkedDashboardId}
                onChange={(e) => setLinkedDashboardId(e.target.value)}
                className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="">None</option>
                {dashboardsInDivision.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

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
              {submitting ? "Creating…" : `Create ${kind}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
