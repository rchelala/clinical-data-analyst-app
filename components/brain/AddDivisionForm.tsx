"use client";

import { useState, useCallback } from "react";
import { FolderPlus } from "lucide-react";
import { Division } from "@/lib/brain-types";

interface AddDivisionFormProps {
  currentAnalystId: number;
  onCreated: (division: Division) => void;
  onCancel: () => void;
}

export function AddDivisionForm({ currentAnalystId, onCreated, onCancel }: AddDivisionFormProps) {
  const [name, setName] = useState("");
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
        const res = await fetch("/api/divisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), analystId: currentAnalystId }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not create division.");
          return;
        }

        onCreated(data as Division);
      } catch {
        setError("Network error — could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [name, currentAnalystId, onCreated]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-xl border border-theme bg-elevated shadow-panel">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <FolderPlus className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Add division
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Create a new division for an incoming dashboard or report subscription.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="divisionName" className="text-xs font-medium text-secondary">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="divisionName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="text-sm rounded-md border border-theme px-3 py-2 bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              {submitting ? "Creating…" : "Create division"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
