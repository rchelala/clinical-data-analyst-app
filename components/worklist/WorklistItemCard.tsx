"use client";

import { ChevronRight, X } from "lucide-react";
import { StatusPrioritySelect } from "@/components/worklist/StatusPrioritySelect";
import { EditableCell, WorklistItem, WorklistItemKind } from "@/app/worklist/page";

interface WorklistItemCardProps {
  item: WorklistItem;
  isOpen: boolean;
  counts: string;
  prioritySuggestions: string[];
  statusSuggestions: string[];
  onPatch: (kind: WorklistItemKind, id: number, patch: Record<string, unknown>) => void;
  onToggle: (kind: WorklistItemKind, id: number) => void;
  onRemove: (id: number) => void;
  children?: React.ReactNode; // expanded task detail, rendered when isOpen
}

// Mobile-only stacked-card presentation of a "My Dashboards / Report
// Subscriptions" worklist row. Mirrors the controls used in the desktop
// table row 1:1 (same StatusPrioritySelect invocations, same EditableCell
// fields, same remove action) so the two stay visually/functionally in sync.
export function WorklistItemCard({
  item,
  isOpen,
  counts,
  prioritySuggestions,
  statusSuggestions,
  onPatch,
  onToggle,
  onRemove,
  children,
}: WorklistItemCardProps) {
  return (
    <div className="rounded-xl border border-theme bg-panel p-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-primary text-sm truncate">{item.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {item.kind === "subscription" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded-full px-2 py-0.5">
                Subscription
              </span>
            )}
            {item.isCovering && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                Covering{item.ownerName ? ` · ${item.ownerName}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onToggle(item.kind, item.id)}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            {counts}
          </button>
          {item.kind === "dashboard" && (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              title="Remove from worklist"
              className="text-secondary hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Priority
          <div className="mt-1">
            <StatusPrioritySelect
              kind="priority"
              value={item.priority}
              suggestions={prioritySuggestions}
              onChange={(value) => onPatch(item.kind, item.id, { priority: value })}
            />
          </div>
        </label>
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Status
          <div className="mt-1">
            <StatusPrioritySelect
              kind="status"
              value={item.worklistStatus}
              suggestions={statusSuggestions}
              onChange={(value) => onPatch(item.kind, item.id, { worklistStatus: value })}
            />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 mt-3">
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Enterprise Analyst
          <EditableCell
            value={item.enterpriseAnalyst}
            onSave={(value) => onPatch(item.kind, item.id, { enterpriseAnalyst: value })}
          />
        </label>
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Comments
          <EditableCell value={item.comments} onSave={(value) => onPatch(item.kind, item.id, { comments: value })} />
        </label>
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Notes
          <EditableCell value={item.notes} onSave={(value) => onPatch(item.kind, item.id, { notes: value })} />
        </label>
        <label className="text-[10px] uppercase tracking-wide text-secondary font-semibold">
          Summary
          <EditableCell value={item.summary} onSave={(value) => onPatch(item.kind, item.id, { summary: value })} />
        </label>
      </div>

      {isOpen && <div className="mt-3 border-t border-theme/60 pt-3">{children}</div>}
    </div>
  );
}
