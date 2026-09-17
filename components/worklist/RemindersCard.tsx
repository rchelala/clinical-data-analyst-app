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
// Phase 4 Task 4). The localStorage write itself happens synchronously on
// every keystroke (it's cheap, and doing so is the whole point of 67973f1 —
// Reminders must survive a refresh or tab close even mid-keystroke). Only
// the "Saved" indicator's timestamp state is debounced, so typing doesn't
// re-render the rest of this card on every keystroke; that debounce still
// flushes on blur and on unmount so the indicator doesn't lag behind.
export function RemindersCard({ analystId }: RemindersCardProps) {
  const [reminders, setReminders] = useState<string>("");
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [remindersSavedAt, setRemindersSavedAt] = useState<number | null>(null);
  const [remindersSaveFailed, setRemindersSaveFailed] = useState(false);

  // Result of the most recent synchronous save, not yet reflected in the
  // "Saved" indicator state, and the pending debounce timer. A ref (not
  // state) so typing doesn't trigger a re-render.
  const pendingDisplayRef = useRef<{ ok: boolean; savedAt: number | null } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const entry = loadReminders(analystId);
    setReminders(entry?.text ?? "");
    setRemindersSavedAt(entry?.updatedAt ?? null);
    setRemindersSaveFailed(false);
    setRemindersLoaded(true);
  }, [analystId]);

  const flushDisplay = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingDisplayRef.current === null) return;
    const { ok, savedAt } = pendingDisplayRef.current;
    pendingDisplayRef.current = null;
    setRemindersSaveFailed(!ok);
    if (ok) setRemindersSavedAt(savedAt);
  }, []);

  // Flush any pending debounced indicator update on unmount — e.g. the
  // analyst-keyed remount on switch, or navigating away — so the "Saved"
  // state doesn't lag stale (the save to localStorage already happened
  // synchronously, so this only affects the indicator, not data safety).
  useEffect(() => {
    return () => flushDisplay();
  }, [flushDisplay]);

  const handleInput = useCallback(
    (value: string) => {
      const ok = saveReminders(analystId, value);
      pendingDisplayRef.current = { ok, savedAt: ok ? (value.trim() ? Date.now() : null) : null };
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(flushDisplay, SAVE_DEBOUNCE_MS);
    },
    [analystId, flushDisplay]
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
          onBlur={() => flushDisplay()}
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
