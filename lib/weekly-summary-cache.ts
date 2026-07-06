// Persists an analyst's generated + hand-edited Weekly Update AI summary so it
// survives closing the drawer and navigating away. Mirrors the SSR-guarded
// localStorage helper pattern in lib/history.ts (try/catch, quota trimming) and
// lib/analyst-identity.ts. Per-browser only — not synced across devices, same as
// every other client-persistence feature in the app.

export interface CachedWeeklySummary {
  analystId: number;
  summary: string; // AI text with manual edits folded in
  updatedAt: number; // ms since epoch, for the "last saved" indicator
  sourceFingerprint: string; // fingerprint of the structured markdown at save time
}

const KEY = "weekly_summary_cache"; // Record<analystId, CachedWeeklySummary>
const MAX_ANALYSTS = 25; // quota-trim bound, like history.ts MAX_ENTRIES

type CacheMap = Record<string, CachedWeeklySummary>;

function readMap(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: CacheMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage full — evict oldest-by-updatedAt entries and retry once.
    const trimmed = Object.values(map)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ANALYSTS - 1);
    const rebuilt: CacheMap = {};
    for (const entry of trimmed) rebuilt[String(entry.analystId)] = entry;
    try {
      localStorage.setItem(KEY, JSON.stringify(rebuilt));
    } catch {
      // Still failing — non-critical, the in-memory edit is not lost this session.
    }
  }
}

export function loadWeeklySummary(analystId: number | null): CachedWeeklySummary | null {
  if (typeof window === "undefined" || analystId === null) return null;
  const map = readMap();
  return map[String(analystId)] ?? null;
}

// Persists (or, for blank input, deletes) the summary for an analyst. Returns the
// saved entry so the caller can update state without a re-read. A blank/whitespace
// summary removes the entry — we never store empty strings, which keeps the
// auto-generate-on-first-open behavior intact next time the drawer opens.
export function saveWeeklySummary(
  analystId: number,
  summary: string,
  sourceFingerprint: string
): CachedWeeklySummary | null {
  if (typeof window === "undefined") return null;
  if (!summary.trim()) {
    clearWeeklySummary(analystId);
    return null;
  }
  const entry: CachedWeeklySummary = {
    analystId,
    summary,
    updatedAt: Date.now(),
    sourceFingerprint,
  };
  const map = readMap();
  map[String(analystId)] = entry;
  writeMap(map);
  return entry;
}

export function clearWeeklySummary(analystId: number): void {
  if (typeof window === "undefined") return;
  const map = readMap();
  if (map[String(analystId)]) {
    delete map[String(analystId)];
    writeMap(map);
  }
}

// Cheap, deterministic fingerprint of the structured markdown used to detect that
// the underlying worklist data changed since a summary was saved (staleness hint).
// No crypto needed — a length-prefixed rolling hash is plenty to catch real edits.
export function computeSourceFingerprint(structuredMarkdown: string): string {
  let hash = 0;
  for (let i = 0; i < structuredMarkdown.length; i++) {
    hash = (hash * 31 + structuredMarkdown.charCodeAt(i)) | 0;
  }
  return `${structuredMarkdown.length}:${(hash >>> 0).toString(36)}`;
}

// Relative "last saved" label, mirroring formatHistoryDate in lib/history.ts.
export function formatSavedAt(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}
