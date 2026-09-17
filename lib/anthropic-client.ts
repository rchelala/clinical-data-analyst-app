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
