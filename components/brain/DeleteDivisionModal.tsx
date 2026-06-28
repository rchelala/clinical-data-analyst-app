"use client";

import { useCallback, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Division } from "@/lib/brain-types";

interface DeleteDivisionModalProps {
  division: Division;
  dashboardCount: number;
  subscriptionCount: number;
  onDeleted: () => void;
  onCancel: () => void;
}

export function DeleteDivisionModal({
  division,
  dashboardCount,
  subscriptionCount,
  onDeleted,
  onCancel,
}: DeleteDivisionModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = dashboardCount > 0 || subscriptionCount > 0;

  const handleDelete = useCallback(async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/divisions/${division.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not delete division.");
        return;
      }

      onDeleted();
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setDeleting(false);
    }
  }, [division.id, onDeleted]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <Trash2 className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Delete division
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {division.name}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {blocked ? (
            <>
              <p className="text-sm text-secondary">
                This division has {dashboardCount} dashboard(s) and {subscriptionCount} subscription(s). Move or delete them first.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-secondary">
                Delete &quot;{division.name}&quot;? This cannot be undone.
              </p>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
                >
                  {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
