"use client";

// Modal form for creating a new intake request from the Unassigned backlog
// page (app/brain/unassigned/page.tsx). Modeled directly on
// components/brain/AddEntityForm.tsx's structure: local field state,
// submit/loading/error handling shape, and the same fixed-overlay modal
// shell + button row.

import { useState, useCallback } from "react";
import { ClipboardList } from "lucide-react";
import {
  Analyst,
  BrainEntityKind,
  Division,
  IntakePriority,
} from "@/lib/brain-types";

interface AddIntakeRequestFormProps {
  divisions: Division[];
  analysts: Analyst[];
  onCreated: () => void;
  onCancel: () => void;
}

const PRIORITY_OPTIONS: { value: IntakePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const REQUESTED_KIND_OPTIONS: { value: BrainEntityKind; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "subscription", label: "Subscription" },
];

export function AddIntakeRequestForm({
  divisions,
  analysts,
  onCreated,
  onCancel,
}: AddIntakeRequestFormProps) {
  const [topic, setTopic] = useState("");
  const [priority, setPriority] = useState<IntakePriority>("low");
  const [divisionId, setDivisionId] = useState("");
  const [stakeholder, setStakeholder] = useState("");
  const [analystId, setAnalystId] = useState("");
  const [requestedKind, setRequestedKind] = useState<BrainEntityKind | "">("");
  const [ticketLink, setTicketLink] = useState("");
  const [internalComments, setInternalComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!topic.trim()) {
        setError("Topic is required.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/intake-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic: topic.trim(),
            priority,
            divisionId: divisionId ? Number(divisionId) : undefined,
            stakeholder: stakeholder.trim() ? stakeholder.trim() : undefined,
            analystId: analystId ? Number(analystId) : undefined,
            requestedKind: requestedKind ? requestedKind : undefined,
            ticketLink: ticketLink.trim() ? ticketLink.trim() : undefined,
            internalComments: internalComments.trim() ? internalComments.trim() : undefined,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not create intake request.");
          return;
        }

        onCreated();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      topic,
      priority,
      divisionId,
      stakeholder,
      analystId,
      requestedKind,
      ticketLink,
      internalComments,
      onCreated,
    ]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardList className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Add intake request
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Adds to the Unassigned backlog.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="intakeTopic" className="text-xs font-medium text-secondary">
              Topic <span className="text-red-500">*</span>
            </label>
            <input
              id="intakeTopic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakePriority" className="text-xs font-medium text-secondary">
              Priority
            </label>
            <select
              id="intakePriority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as IntakePriority)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeDivision" className="text-xs font-medium text-secondary">
              Division
            </label>
            <select
              id="intakeDivision"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">None</option>
              {divisions.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeStakeholder" className="text-xs font-medium text-secondary">
              Stakeholder
            </label>
            <input
              id="intakeStakeholder"
              type="text"
              value={stakeholder}
              onChange={(e) => setStakeholder(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeAnalyst" className="text-xs font-medium text-secondary">
              Analyst
            </label>
            <select
              id="intakeAnalyst"
              value={analystId}
              onChange={(e) => setAnalystId(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">Unassigned</option>
              {analysts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeRequestedKind" className="text-xs font-medium text-secondary">
              Requested kind
            </label>
            <select
              id="intakeRequestedKind"
              value={requestedKind}
              onChange={(e) => setRequestedKind(e.target.value as BrainEntityKind | "")}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">Unset</option>
              {REQUESTED_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeTicketLink" className="text-xs font-medium text-secondary">
              Ticket link
            </label>
            <input
              id="intakeTicketLink"
              type="text"
              value={ticketLink}
              onChange={(e) => setTicketLink(e.target.value)}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="intakeInternalComments" className="text-xs font-medium text-secondary">
              Internal comments
            </label>
            <textarea
              id="intakeInternalComments"
              value={internalComments}
              onChange={(e) => setInternalComments(e.target.value)}
              rows={3}
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

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
              {submitting ? "Creating…" : "Create request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
