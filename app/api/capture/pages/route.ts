// app/api/capture/pages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parsePbrsPortalUrl } from "@/lib/powerbi-export-client";
import { getReportPages } from "@/lib/playwright-capture";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  const parsed = parsePbrsPortalUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid PBRS URL — must start with /reports/powerbi, /reports/report, or /reports/browse" }, { status: 400 });
  }

  try {
    const pages = await getReportPages(url);
    return NextResponse.json({ pages });
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
