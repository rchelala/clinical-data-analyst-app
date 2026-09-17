// Claude is asked for a raw JSON response in several routes (IT Reference,
// Clinician Guide, CMIO Review) but sometimes wraps it in a ```json ... ```
// markdown fence anyway. This strips that fencing (if present) and parses
// the result. Throws like JSON.parse on invalid JSON — each call site keeps
// its own try/catch to decide how to react to a parse failure (fall back to
// a non-AI default, drop the chunk, etc.), so this only does the parsing.
export function parseJsonResponse<T = unknown>(rawText: string): T {
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(jsonText) as T;
}
