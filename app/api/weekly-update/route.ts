import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildWeeklyUpdatePrompt } from "@/lib/prompts";
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

// The structured worklist markdown this route summarizes is generated
// client-side from a bounded set of items (one analyst's week), so normal
// usage is nowhere near this — it exists to cap worst-case LLM spend/latency.
const MAX_MARKDOWN_LENGTH = 100_000;
const MAX_ANALYST_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
  try {
    // Namespaced so this route gets its own rate-limit budget instead of
    // sharing one bucket with every other LLM route on the same client IP
    // (hospital users often sit behind one shared NAT IP).
    const { allowed, retryAfterSeconds } = await checkRateLimit(`weekly-update:${getClientIp(req)}`);
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { markdown, analystName, provider = "claude" } = body as {
      markdown: string;
      analystName: string;
      provider?: AIProvider;
    };

    if (typeof markdown !== "string" || !markdown.trim()) {
      return NextResponse.json({ error: "No worklist data provided." }, { status: 400 });
    }

    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      return NextResponse.json(
        { error: `Input too large. Please keep worklist data under ${MAX_MARKDOWN_LENGTH.toLocaleString()} characters.` },
        { status: 400 }
      );
    }

    if (analystName != null && typeof analystName !== "string") {
      return NextResponse.json({ error: "Invalid analyst name." }, { status: 400 });
    }

    if (analystName && analystName.length > MAX_ANALYST_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Analyst name too long. Please keep it under ${MAX_ANALYST_NAME_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const prompt = buildWeeklyUpdatePrompt(markdown, analystName ?? "");

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
      const text = result.text ?? "";
      return NextResponse.json({ summary: text });
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
        model: "claude-haiku-4-5-20251001",
        // Sectioned output runs one line per worklist item, so it is longer than
        // the few paragraphs this used to produce. Headroom here avoids silently
        // truncating the tail sections of a busy week.
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: req.signal }
    );

    const result = message.content[0];
    if (result.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI." }, { status: 500 });
    }

    return NextResponse.json({ summary: result.text });
  } catch (err: unknown) {
    console.error("Weekly update API error:", err);
    if (isAnthropicTimeout(err)) {
      return NextResponse.json({ error: AI_TIMEOUT_MESSAGE }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
