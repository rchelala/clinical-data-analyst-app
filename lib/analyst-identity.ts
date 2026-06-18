// Mirrors the localStorage pattern in lib/providers.ts, but for the
// "viewing analyst" identity used by Dashboard Brain. Unlike AIProvider,
// analysts are a dynamic list fetched from /api/analysts (not a fixed
// union type), so we store/load a numeric id rather than a string literal.

export const ANALYST_STORAGE_KEY = "dashboard_brain_analyst_id";

export function loadAnalystId(): number | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(ANALYST_STORAGE_KEY);
  if (stored === null) return null;
  const parsed = Number(stored);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveAnalystId(analystId: number): void {
  localStorage.setItem(ANALYST_STORAGE_KEY, String(analystId));
}
