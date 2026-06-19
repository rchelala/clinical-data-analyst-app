"use client";

import { useState, useCallback } from "react";
import { ClipboardPlus } from "lucide-react";
import { BrainEntityKind, Division } from "@/lib/brain-types";

interface AddEntityFormProps {
  division: Division; // the division currently being viewed — pre-filled, not user-selectable
  currentAnalystId: number;
  onCreated: () => void;
  onCancel: () => void;
}

const ENTITY_ENDPOINTS: Record<BrainEntityKind, string> = {
  dashboard: "/api/dashboards",
  subscription: "/api/report-subscriptions",
};

export function AddEntityForm({
  division,
  currentAnalystId,
  onCreated,
  onCancel,
}: AddEntityFormProps) {
  const [kind, setKind] = useState<BrainEntityKind>("dashboard");
  const [name, setName] = useState("");
  const [stakeholder, setStakeholder] = useState("");
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
        const res = await fetch(ENTITY_ENDPOINTS[kind], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            divisionId: division.id,
            analystId: currentAnalystId,
            stakeholder: stakeholder.trim() ? stakeholder.trim() : undefined,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? `Could not create ${kind}.`);
          return;
        }

        onCreated();
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [kind, name, stakeholder, division.id, currentAnalystId, onCreated]
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
              Add dashboard or subscription
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Adding to: {division.name}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
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
                      : "border-theme text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700"
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
              {submitting ? "Creating…" : `Create ${kind}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
