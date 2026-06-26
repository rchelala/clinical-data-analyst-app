import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { buildPrompt, buildSummaryPrompt, Language, Density } from "@/lib/prompts";
import { AIProvider } from "@/lib/providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await genAI.models.generateContent({ model: "gemini-2.5-flash-lite", contents: prompt });
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

    const message = await anthropic.messages.create({
      // Haiku for summaries (cheap, short output) — Sonnet for full commenting (handles large files)
      model: isSummary ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
      max_tokens: isSummary ? 1024 : 16000,
      messages: [{ role: "user", content: prompt }],
    });

    const result = message.content[0];
    if (result.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI." }, { status: 500 });
    }

    return NextResponse.json(isSummary ? { summary: result.text } : { commented: result.text });
  } catch (err: unknown) {
    console.error("Comment API error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
