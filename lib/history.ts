import { Language, Density } from "./prompts";

export interface HistoryEntry {
  id: string;
  timestamp: number; // ms since epoch
  language: Language;
  density: Density;
  input: string;
  output: string;
}

const KEY = "commenter_history";
const MAX_ENTRIES = 25;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

// Persists entries, trimming from the oldest end (the array is newest-first)
// and retrying if the write fails — e.g. QuotaExceededError. This runs inside
// a setHistory functional updater in app/page.tsx, so it must never throw:
// an uncaught error here would crash render.
export function saveHistory(entries: HistoryEntry[]): void {
  let toSave = entries;
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(toSave));
      return;
    } catch {
      if (toSave.length === 0) {
        console.warn("saveHistory: could not persist history — storage unavailable even when empty.");
        return;
      }
      toSave = toSave.slice(0, toSave.length - 1);
    }
  }
}

export function addHistoryEntry(
  entries: HistoryEntry[],
  entry: Omit<HistoryEntry, "id" | "timestamp">
): HistoryEntry[] {
  const newEntry: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const updated = [newEntry, ...entries].slice(0, MAX_ENTRIES);
  saveHistory(updated);
  return updated;
}

export function removeHistoryEntry(
  entries: HistoryEntry[],
  id: string
): HistoryEntry[] {
  const updated = entries.filter((e) => e.id !== id);
  saveHistory(updated);
  return updated;
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}

// ─── Field Request History ────────────────────────────────────────────────────

export interface FieldRequestEntry {
  id: string;
  timestamp: number;
  templateType: string;
  tableName: string;
  date: string;
  rows: Record<string, string | number>[];
  attachedDashboardName?: string; // set after a successful attach, for display only
}

const FIELD_KEY = "field_request_history";
const FIELD_MAX = 20;

export function loadFieldHistory(): FieldRequestEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FIELD_KEY);
    return raw ? (JSON.parse(raw) as FieldRequestEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveFieldHistory(entries: FieldRequestEntry[]): void {
  let toSave = entries;
  for (;;) {
    try {
      localStorage.setItem(FIELD_KEY, JSON.stringify(toSave));
      return;
    } catch {
      if (toSave.length === 0) {
        console.warn("saveFieldHistory: could not persist field history — storage unavailable even when empty.");
        return;
      }
      toSave = toSave.slice(0, toSave.length - 1);
    }
  }
}

export function addFieldHistoryEntry(
  entries: FieldRequestEntry[],
  entry: Omit<FieldRequestEntry, "id" | "timestamp">
): FieldRequestEntry[] {
  const newEntry: FieldRequestEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const updated = [newEntry, ...entries].slice(0, FIELD_MAX);
  saveFieldHistory(updated);
  return updated;
}

export function removeFieldHistoryEntry(
  entries: FieldRequestEntry[],
  id: string
): FieldRequestEntry[] {
  const updated = entries.filter((e) => e.id !== id);
  saveFieldHistory(updated);
  return updated;
}

export function markFieldHistoryEntryAttached(
  entries: FieldRequestEntry[],
  id: string,
  dashboardName: string
): FieldRequestEntry[] {
  const updated = entries.map((e) =>
    e.id === id ? { ...e, attachedDashboardName: dashboardName } : e
  );
  saveFieldHistory(updated);
  return updated;
}

export function clearFieldHistory(): void {
  localStorage.removeItem(FIELD_KEY);
}

export function formatHistoryDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
