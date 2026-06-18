"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCircle2, RefreshCw } from "lucide-react";
import { Analyst } from "@/lib/brain-types";
import { loadAnalystId, saveAnalystId } from "@/lib/analyst-identity";

interface AnalystSelectorProps {
  onSelect: (analystId: number) => void;
}

export function AnalystSelector({ onSelect }: AnalystSelectorProps) {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Modal is shown either because no analyst id was stored yet, or because
  // the user deliberately clicked "Switch" to re-open the selector.
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/analysts");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load analysts.");
          return;
        }

        setAnalysts(data);

        const storedId = loadAnalystId();
        if (storedId !== null) {
          onSelect(storedId);
        } else {
          setModalOpen(true);
        }
      } catch {
        if (!cancelled) setError("Network error — could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = useCallback(
    (analystId: number) => {
      saveAnalystId(analystId);
      setModalOpen(false);
      onSelect(analystId);
    },
    [onSelect]
  );

  return (
    <>
      {/* Small inline control to deliberately re-open the selector later. */}
      <button
        onClick={() => setModalOpen(true)}
        title="Switch analyst"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Switch analyst
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm mx-4 rounded-lg border border-theme bg-panel shadow-xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
                <UserCircle2 className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-primary leading-none">
                  Who are you?
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Pick your analyst identity to view your dashboards.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 max-h-80 overflow-y-auto">
              {loading && (
                <p className="text-sm text-secondary">Loading analysts…</p>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              {!loading && !error && analysts.length === 0 && (
                <p className="text-sm text-secondary">No analysts found.</p>
              )}

              {!loading && !error && analysts.length > 0 && (
                <div className="flex flex-col gap-2">
                  {analysts.map((analyst) => (
                    <button
                      key={analyst.id}
                      onClick={() => handlePick(analyst.id)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-theme text-primary hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                    >
                      <UserCircle2 className="w-4 h-4 text-secondary flex-shrink-0" />
                      {analyst.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
