import Anthropic from "@anthropic-ai/sdk";

// Netlify kills a synchronous function at roughly 26s regardless of what
// `maxDuration` claims — Netlify does not reliably honor it, so this is the
// real budget every LLM route lives inside. The Anthropic SDK defaults to a
// 10-minute client timeout with 2 retries; left unconfigured, the host kills
// a slow request mid-flight and the caller sees a raw 504 instead of a clean
// JSON error. Give the LLM call ~22s (leaving a few seconds of headroom for
// the rest of the handler — JSON parsing, doc building, DB writes) and don't
// retry, since a retry would spend that whole budget again on a request that
// already failed to finish once.
export const ANTHROPIC_TIMEOUT_MS = 22_000;

// Shared client for routes that don't have a specific reason to build their
// own. Reuses one instance instead of constructing (and re-reading env/config
// for) a new Anthropic client on every request.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: ANTHROPIC_TIMEOUT_MS,
  maxRetries: 0,
});

export const AI_TIMEOUT_MESSAGE = "The AI took too long to respond. Try a smaller input or try again.";

/**
 * True when `err` is the SDK's own signal that a request didn't finish in
 * time — either it hit our client-side timeout (Anthropic's
 * APIConnectionTimeoutError) or was aborted via an AbortSignal (Anthropic's
 * APIUserAbortError, e.g. `{ signal: req.signal }` when the caller
 * disconnects). Also recognizes the equivalent shapes from @google/genai
 * (its APIConnectionTimeoutError class isn't part of that package's public
 * exports, so it's matched by constructor name) and a bare AbortError from an
 * aborted fetch. Routes should turn this into a clean 504 instead of falling
 * through to a generic 500.
 */
export function isAnthropicTimeout(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return true;
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const ctorName = err.constructor?.name;
    if (ctorName === "APIConnectionTimeoutError" || ctorName === "APIUserAbortError") return true;
  }
  return false;
}

// Statuses the Anthropic SDK's own retry logic would normally retry (see the
// SDK's default `maxRetries`), which we've turned off above (maxRetries: 0)
// because a client-side retry would spend our whole ~22s request budget
// again on a request that already failed to finish once. A step route can
// afford to "retry" differently: leave the job's progress where it is and
// let the client's next poll (a fresh request, fresh budget) make the next
// attempt, rather than failing the whole job over a transient blip.
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

/**
 * True when `err` is a transient upstream failure worth leaving a step-route
 * job in place for (so the next poll retries it) rather than failing the job
 * outright: a rate limit (429), a server-side error (500/502/503), Anthropic
 * being temporarily overloaded (529), or a connection reset/network error
 * that is NOT a timeout (isAnthropicTimeout already covers timeouts/aborts,
 * which should surface as AI_TIMEOUT_MESSAGE instead of being retried here —
 * a timeout means our own budget ran out, not that the upstream call would
 * likely succeed again immediately).
 */
export function isRetryableAnthropicError(err: unknown): boolean {
  if (isAnthropicTimeout(err)) return false;
  if (err instanceof Anthropic.APIConnectionError) {
    // Covers plain network errors (e.g. connection reset). Subclasses that
    // are timeouts/aborts are already excluded above.
    return true;
  }
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    return RETRYABLE_STATUS_CODES.has(err.status);
  }
  return false;
}

// How long a job is allowed to keep "retrying" a transient error before a
// step route gives up and fails it outright — guards against a job polling
// forever when transient errors don't actually clear up. No per-job counter
// column exists for consecutive transient failures, so this caps by job age
// instead (a job that's been running this long has almost certainly stalled
// regardless of cause).
export const MAX_JOB_AGE_MS = 30 * 60 * 1000;

export function isJobTooOld(createdAt: string | Date): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Date.now() - created.getTime() > MAX_JOB_AGE_MS;
}
