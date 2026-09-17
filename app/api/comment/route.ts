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

    if (code.length > 200_000) {
      return NextResponse.json({ error: "Input too large. Please keep code under 200,000 characters." }, { status: 400 });
    }

    const isSummary = mode === "summarize";
    const prompt = isSummary
      ? buildSummaryPrompt(code, language)
      : buildPrompt(code, language, density);

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
        // Haiku for summaries (cheap, short output) — Sonnet for full commenting (handles large files)
        model: isSummary ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
        max_tokens: isSummary ? 1024 : 16000,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: req.signal }
    );

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
