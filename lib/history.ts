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

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage full — drop oldest and retry
    const trimmed = entries.slice(0, MAX_ENTRIES - 1);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
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
  try {
    localStorage.setItem(FIELD_KEY, JSON.stringify(entries));
  } catch {
    const trimmed = entries.slice(0, FIELD_MAX - 1);
    localStorage.setItem(FIELD_KEY, JSON.stringify(trimmed));
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
