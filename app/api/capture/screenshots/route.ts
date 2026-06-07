// app/api/capture/screenshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { parsePbrsPortalUrl } from "@/lib/powerbi-export-client";
import { capturePages } from "@/lib/playwright-capture";

// Extend route timeout — report loads can take 60+ seconds
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json() as { url?: string; pages?: string[] };
  const { url, pages } = body;

  if (!url || !Array.isArray(pages) || pages.length === 0 || !pages.every((p) => typeof p === "string" && p.length > 0)) {
    return NextResponse.json({ error: "url and non-empty pages array required" }, { status: 400 });
  }

  if (!parsePbrsPortalUrl(url)) {
    return NextResponse.json({ error: "Invalid PBRS URL" }, { status: 400 });
  }

  try {
    const screenshots = await capturePages(url, pages);

    const zip = new JSZip();
    screenshots.forEach(({ name, data }, i) => {
      const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || `Page ${i + 1}`;
      const idx = String(i + 1).padStart(2, "0");
      zip.file(`${idx}-${safe}.png`, data);
    });

    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="dashboard-pages.zip"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Executable doesn't exist") || message.includes("playwright install")) {
      return NextResponse.json(
        { error: "Playwright chromium not installed. Run: npx playwright install chromium" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
