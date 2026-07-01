"use client";

import { History, Trash2, X, Clock, Code2 } from "lucide-react";
import { HistoryEntry, formatHistoryDate, clearHistory } from "@/lib/history";

interface Props {
  entries: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  open: boolean;
  onClose: () => void;
}

export function HistoryPanel({
  entries,
  onSelect,
  onDelete,
  onClearAll,
  open,
  onClose,
}: Props) {
  if (!open) return null;

  const handleClearAll = () => {
    clearHistory();
    onClearAll();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 z-40 h-full w-80 flex flex-col bg-secondary-glass border-l border-theme shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme bg-panel flex-shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-secondary" />
            <span className="text-sm font-semibold text-primary">Recent Sessions</span>
          </div>
          <div className="flex items-center gap-1">
            {entries.length > 0 && (
              <button
                onClick={handleClearAll}
                title="Clear all history"
                className="flex items-center gap-1 px-2 py-1 text-xs text-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded text-secondary hover:text-primary hover:bg-panel transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-panel border border-theme">
                <Clock className="w-5 h-5 text-secondary" />
              </div>
              <p className="text-sm text-secondary">No history yet</p>
              <p className="text-xs text-secondary/70">
                Sessions are saved automatically after commenting
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-theme">
              {entries.map((entry) => (
                <li key={entry.id} className="group relative">
                  <button
                    onClick={() => { onSelect(entry); onClose(); }}
                    className="w-full text-left px-4 py-3 hover:bg-panel transition-colors"
                  >
                    {/* Language badge + date */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-brand-500/15 text-brand-400">
                        <Code2 className="w-2.5 h-2.5" />
                        {entry.language}
                      </span>
                      <span className="text-[10px] text-secondary/70">
                        {formatHistoryDate(entry.timestamp)}
                      </span>
                    </div>

                    {/* Snippet preview */}
                    <p className="text-xs text-primary font-mono truncate leading-relaxed">
                      {entry.input.trim().split("\n")[0] || "(empty)"}
                    </p>
                    <p className="text-[10px] text-secondary mt-0.5">
                      {entry.input.split("\n").length} lines · {entry.density}
                    </p>
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                    title="Remove this entry"
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-theme bg-panel flex-shrink-0">
          <p className="text-[10px] text-secondary/70 text-center">
            Saved locally in this browser only
          </p>
        </div>
      </div>
    </>
  );
}
