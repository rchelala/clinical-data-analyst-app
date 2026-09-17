"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { loadReminders, saveReminders } from "@/lib/reminders-cache";
import { formatSavedAt } from "@/lib/weekly-summary-cache";

// How long to wait after the last keystroke before writing to localStorage
// and updating the "Saved" indicator.
const SAVE_DEBOUNCE_MS = 500;

interface RemindersCardProps {
  // Non-null: the page only renders this card once an analyst is selected,
  // and remounts it (via `key={analystId}`) on analyst switch.
  analystId: number;
}

// Private, persistent "Reminders" note beside Meetings this week. Extracted
// into its own component so typing here doesn't re-render the rest of the
// Worklist page (dashboards/subscriptions table, PSQ table, etc. — see
// Phase 4 Task 4). Debounces both the localStorage write and the "Saved"
// timestamp so a keystroke only schedules a state update, not causes one
// immediately; the debounce still flushes on blur and on unmount so nothing
// typed is lost by navigating away or switching analysts mid-pause.
export function RemindersCard({ analystId }: RemindersCardProps) {
  const [reminders, setReminders] = useState<string>("");
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [remindersSavedAt, setRemindersSavedAt] = useState<number | null>(null);
  const [remindersSaveFailed, setRemindersSaveFailed] = useState(false);

  // Latest typed value not yet flushed to localStorage, and the pending
  // debounce timer. Refs (not state) so typing doesn't trigger a re-render.
  const pendingValueRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const entry = loadReminders(analystId);
    setReminders(entry?.text ?? "");
    setRemindersSavedAt(entry?.updatedAt ?? null);
    setRemindersSaveFailed(false);
    setRemindersLoaded(true);
  }, [analystId]);

  const flush = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingValueRef.current === null) return;
    const value = pendingValueRef.current;
    pendingValueRef.current = null;
    const ok = saveReminders(analystId, value);
    setRemindersSaveFailed(!ok);
    if (ok) setRemindersSavedAt(value.trim() ? Date.now() : null);
  }, [analystId]);

  // Flush any pending debounced save on unmount — e.g. the analyst-keyed
  // remount on switch, or navigating away — so a save mid-debounce isn't lost.
  useEffect(() => {
    return () => flush();
  }, [flush]);

  const handleInput = useCallback(
    (value: string) => {
      pendingValueRef.current = value;
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  return (
    <div className="min-w-0 rounded-lg border border-theme bg-panel shadow-panel px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-secondary font-medium">
          <StickyNote className="w-3 h-3" />
          Reminders
        </label>
        {remindersSaveFailed ? (
          <span className="text-[11px] text-red-400">Not saved — browser storage unavailable</span>
        ) : remindersSavedAt !== null ? (
          <span className="text-[11px] text-secondary">Saved {formatSavedAt(remindersSavedAt)}</span>
        ) : null}
      </div>
      {remindersLoaded ? (
        <div
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Quick notes to self…"
          onInput={(e) => handleInput(e.currentTarget.innerText)}
          onBlur={() => flush()}
          className="mt-1.5 text-sm text-primary whitespace-pre-wrap break-words outline-none rounded-md px-2 py-1.5 border border-transparent hover:border-theme hover:bg-secondary-glass focus:border-brand-500 focus:bg-secondary-glass transition-colors min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-secondary"
        >
          {reminders}
        </div>
      ) : (
        <div className="mt-1.5 h-6 flex items-center">
          <Loader2 className="w-3.5 h-3.5 text-secondary animate-spin" />
        </div>
      )}
    </div>
  );
}
