// app/api/capture/status/route.ts
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET() {
  let chromiumInstalled = false;
  try {
    const execPath = chromium.executablePath();
    chromiumInstalled = existsSync(execPath);
  } catch {
    chromiumInstalled = false;
  }
  return NextResponse.json({ chromiumInstalled });
}
