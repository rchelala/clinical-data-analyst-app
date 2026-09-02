// Trims a provided string field to null when empty, matching the
// null-vs-empty-string normalization EditEntityForm already applies
// client-side. `undefined` (not provided) and `null` (explicit clear)
// pass through unchanged.
export function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
