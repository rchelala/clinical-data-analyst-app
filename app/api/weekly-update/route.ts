import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { buildWeeklyUpdatePrompt } from "@/lib/prompts";
import { AIProvider } from "@/lib/providers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { markdown, analystName, provider = "claude" } = body as {
      markdown: string;
      analystName: string;
      provider?: AIProvider;
    };

    if (!markdown?.trim()) {
      return NextResponse.json({ error: "No worklist data provided." }, { status: 400 });
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
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await genAI.models.generateContent({ model: "gemini-2.5-flash-lite", contents: prompt });
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

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      // Sectioned output runs one line per worklist item, so it is longer than
      // the few paragraphs this used to produce. Headroom here avoids silently
      // truncating the tail sections of a busy week.
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });

    const result = message.content[0];
    if (result.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI." }, { status: 500 });
    }

    return NextResponse.json({ summary: result.text });
  } catch (err: unknown) {
    console.error("Weekly update API error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
