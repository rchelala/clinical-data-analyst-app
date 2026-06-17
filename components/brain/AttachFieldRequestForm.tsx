"use client";

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { FieldRequestEntry, loadFieldHistory, formatHistoryDate, markFieldHistoryEntryAttached } from "@/lib/history";
import { attachFieldRequestToDashboard, summarizeFieldRequest } from "@/lib/field-request-attach";

interface AttachFieldRequestFormProps {
  dashboardId: number;
  dashboardName: string;
  analystId: number;
  onAttached: () => void;
  onClose: () => void;
}

export function AttachFieldRequestForm({
  dashboardId,
  dashboardName,
  analystId,
  onAttached,
  onClose,
}: AttachFieldRequestFormProps) {
  const [entries, setEntries] = useState<FieldRequestEntry[]>(() => loadFieldHistory());
  // Per-entry in-flight tracking, so attaching one entry doesn't disable the rest of the list.
  const [attachingIds, setAttachingIds] = useState<Set<string>>(new Set());
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});

  const handleAttach = async (entry: FieldRequestEntry) => {
    setEntryErrors((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    setAttachingIds((prev) => new Set(prev).add(entry.id));

    try {
      await attachFieldRequestToDashboard(entry, dashboardId, analystId);
      setEntries((prev) => markFieldHistoryEntryAttached(prev, entry.id, dashboardName));
      setAttachedIds((prev) => new Set(prev).add(entry.id));
      onAttached();
    } catch (err) {
      setEntryErrors((prev) => ({
        ...prev,
        [entry.id]: err instanceof Error ? err.message : "Could not attach field request.",
      }));
    } finally {
      setAttachingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <ClipboardList className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              Attach field request
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Attach a saved field request to {dashboardName}.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 max-h-96 overflow-y-auto">
          {entries.length === 0 && (
            <p className="text-sm text-secondary">
              No field requests saved yet — build one from the Field Request tab.
            </p>
          )}

          {entries.length > 0 && (
            <div className="flex flex-col gap-3">
              {entries.map((entry) => {
                const isAttaching = attachingIds.has(entry.id);
                const isAttached = attachedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-theme px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-primary">
                          {entry.tableName.trim() || "Untitled field request"}
                        </p>
                        <p className="text-xs text-secondary mt-0.5">
                          {summarizeFieldRequest(entry)}
                        </p>
                        <p className="text-xs text-secondary mt-0.5">
                          {formatHistoryDate(entry.timestamp)}
                        </p>
                      </div>

                      {isAttached ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md text-green-600 dark:text-green-400 flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Attached
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAttach(entry)}
                          disabled={isAttaching}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-60 flex-shrink-0"
                        >
                          {isAttaching ? "Attaching…" : "Attach"}
                        </button>
                      )}
                    </div>

                    {entryErrors[entry.id] && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                        {entryErrors[entry.id]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-theme">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
