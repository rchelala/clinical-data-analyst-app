import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildPrompt, buildSummaryPrompt, Language, Density } from "@/lib/prompts";
import { AIProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { anthropic, isAnthropicTimeout, AI_TIMEOUT_MESSAGE, ANTHROPIC_TIMEOUT_MS } from "@/lib/anthropic-client";

// Constructed once at module load (not per-request) — safe even when
// GEMINI_API_KEY is unset, since the SDK only warns rather than throwing;
// the "key not configured" check below still runs before any Gemini call.
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { timeout: ANTHROPIC_TIMEOUT_MS },
});

// Netlify's ~26s function budget minus headroom for the rest of the handler
// (JSON parsing, response building) leaves ~20s for the LLM call. Haiku
// generates at roughly 150+ tokens/s, so 20s of generation is a budget of
// ~3,000 output tokens — at ~3.5 chars/token, ~10,500 output chars.
//
// Comment mode rewrites the input with inline comments, but how much LARGER
// than the input the output gets depends on the chosen density
// (lib/prompts.ts's densityInstructions): "brief" adds one short phrase per
// line (output ≈ input, ~1x), "detailed" adds a full explanatory sentence
// per line plus section headers (~2x), and "step-by-step" adds WHAT/WHY/
// gotcha explanations per line plus section headers (~3x). Dividing the
// fixed ~10,500-char output budget by each level's expansion factor gives
// its input cap, rounded down for margin. Applies to both Claude and Gemini
// — nothing in this codebase gives Gemini a separately-derived limit, and
// its comment-mode output has the same expansion-by-density shape.
const COMMENT_MAX_INPUT_CHARS: Record<Density, number> = {
  brief: 12_000, // ~1x expansion — full output budget
  detailed: 8_000, // ~2x expansion — half the budget in, double out
  "step-by-step": 5_000, // ~3x expansion — a third of the budget in, triple out
};

// "summarize" mode's output is capped at 1024 tokens (see max_tokens below)
// regardless of input size — a summary is bounded, not proportional to the
// code it describes — so it keeps its own, much larger original ceiling
// rather than the comment-mode caps above.
const SUMMARIZE_MAX_INPUT_CHARS = 200_000;

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { code, language, density, mode, provider = "claude" } = body as {
      code: string;
      language: Language;
      density: Density;
      mode?: "comment" | "summarize";
      provider?: AIProvider;
    };

    if (!code?.trim()) {
      return NextResponse.json({ error: "No code provided." }, { status: 400 });
    }

    const isSummary = mode === "summarize";
    // Comment mode's cap depends on the chosen density (its output expands
    // by a different factor per level — see COMMENT_MAX_INPUT_CHARS above).
    // Fall back to the "brief" cap for a missing/unrecognized density rather
    // than crashing on an undefined lookup.
    const maxInputChars = isSummary
      ? SUMMARIZE_MAX_INPUT_CHARS
      : COMMENT_MAX_INPUT_CHARS[density] ?? COMMENT_MAX_INPUT_CHARS.brief;

    if (code.length > maxInputChars) {
      const levelNote = isSummary ? "" : ` at the "${density}" comment level`;
      return NextResponse.json(
        {
          error: `Input too large${levelNote}. Please keep code under ${maxInputChars.toLocaleString()} characters — split large code into sections${
            isSummary ? "" : ", or choose a lighter comment level,"
          } and run each one separately.`,
        },
        { status: 400 }
      );
    }

    const prompt = isSummary
      ? buildSummaryPrompt(code, language)
      : buildPrompt(code, language, density);

    // Shared 422 for both providers when the model ran out of room mid-
    // response (max_tokens / MAX_TOKENS) — the content returned is
    // truncated, not a complete result, and returning it silently would
    // hand back broken/cut-off comments (or a chopped summary) with no
    // indication anything went wrong.
    const truncatedResponse = () =>
      NextResponse.json(
        {
          error: isSummary
            ? "The summary was too long to finish. Try a smaller section."
            : "The commented result was too long to finish. Try a smaller section or a lighter comment level.",
        },
        { status: 422 }
      );

    // ── Gemini ────────────────────────────────────────────────────────────────
    if (provider === "gemini") {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "Gemini API key not configured. Add GEMINI_API_KEY to your environment variables." },
          { status: 500 }
        );
      }
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
        config: { abortSignal: req.signal },
      });

      if (result.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        return truncatedResponse();
      }

      const text = result.text ?? "";
      return NextResponse.json(isSummary ? { summary: text } : { commented: text });
    }

    // ── Claude (default) ──────────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "API key not configured. Add ANTHROPIC_API_KEY to your environment variables." },
        { status: 500 }
      );
    }

    const message = await anthropic.messages.create(
      {
        // Haiku for both modes — fast enough to finish within Netlify's
        // function budget now that the per-mode/level caps above keep
        // output bounded too.
        model: "claude-haiku-4-5-20251001",
        max_tokens: isSummary ? 1024 : 6000,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: req.signal }
    );

    if (message.stop_reason === "max_tokens") {
      return truncatedResponse();
    }

    const result = message.content[0];
    if (result.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI." }, { status: 500 });
    }

    return NextResponse.json(isSummary ? { summary: result.text } : { commented: result.text });
  } catch (err: unknown) {
    console.error("Comment API error:", err);
    if (isAnthropicTimeout(err)) {
      return NextResponse.json({ error: AI_TIMEOUT_MESSAGE }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
