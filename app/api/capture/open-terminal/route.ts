// app/api/capture/open-terminal/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST() {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "This feature is only available on Windows" },
      { status: 400 }
    );
  }

  const projectRoot = process.cwd();
  // Set-Location moves to project dir; Insert pre-fills the prompt via PSReadLine
  const psCommand = `Set-Location '${projectRoot}'; [Microsoft.PowerShell.PSConsoleReadLine]::Insert('npx playwright install chromium')`;

  try {
    const child = spawn("powershell.exe", ["-NoExit", "-Command", psCommand], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (error) {
    console.error("Failed to spawn PowerShell:", error);
    return NextResponse.json(
      { error: "Failed to open terminal. Is PowerShell installed?" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
