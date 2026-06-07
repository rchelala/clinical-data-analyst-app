// app/api/capture/open-terminal/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST() {
  const projectRoot = process.cwd();
  // Set-Location moves to project dir; Insert pre-fills the prompt via PSReadLine
  const psCommand = `Set-Location '${projectRoot}'; [Microsoft.PowerShell.PSConsoleReadLine]::Insert('npx playwright install chromium')`;

  const child = spawn("powershell.exe", ["-NoExit", "-Command", psCommand], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({ ok: true });
}
