// Persists an analyst's free-text Worklist "Reminders" note in the browser so it
// survives refreshes and stays until the analyst clears it. Mirrors the
// SSR-guarded localStorage pattern in lib/weekly-summary-cache.ts. Per-browser
// only — not synced across devices, and never included in the weekly update.

export interface CachedReminders {
  analystId: number;
  text: string;
  updatedAt: number; // ms since epoch, for the "Saved" indicator
}

const KEY = "worklist_reminders"; // Record<analystId, CachedReminders>

type CacheMap = Record<string, CachedReminders>;

function readMap(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: CacheMap): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function loadReminders(analystId: number | null): CachedReminders | null {
  if (typeof window === "undefined" || analystId === null) return null;
  return readMap()[String(analystId)] ?? null;
}

// Saves the note, or removes it when blank (clearing the box is the explicit
// "clear"). Returns false when browser storage is unavailable or full, so the
// UI can warn that the note was not saved.
export function saveReminders(analystId: number, text: string): boolean {
  if (typeof window === "undefined") return false;
  const map = readMap();
  if (text.trim()) {
    map[String(analystId)] = { analystId, text: text.trim(), updatedAt: Date.now() };
  } else {
    delete map[String(analystId)];
  }
  return writeMap(map);
}
