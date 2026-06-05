import { exec } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execAsync = promisify(exec);

interface AzTokenOutput {
  accessToken: string;
  expiresOn: string;
  tokenType: string;
}

export async function GET() {
  try {
    const { stdout } = await execAsync(
      "az account get-access-token --resource https://analysis.windows.net/powerbi/api --output json",
      { timeout: 15000 }
    );

    const parsed: AzTokenOutput = JSON.parse(stdout.trim());

    return NextResponse.json({
      accessToken: parsed.accessToken,
      expiresOn: parsed.expiresOn,
    });
  } catch (err: unknown) {
    const execErr = err as { killed?: boolean; code?: number | string; stderr?: string; message?: string };
    const stderr = execErr.stderr ?? "";
    const message = execErr.message ?? "";

    if (execErr.killed) {
      return NextResponse.json({ error: "azure_cli_timeout" }, { status: 504 });
    }

    // Windows: "'az' is not recognized as an internal or external command"
    // Linux/macOS: "az: not found" or "command not found"
    const cliNotFound =
      stderr.includes("is not recognized") ||
      stderr.includes("command not found") ||
      stderr.includes("az: not found") ||
      message.includes("az: not found");

    if (cliNotFound) {
      return NextResponse.json({ error: "azure_cli_not_found" }, { status: 503 });
    }

    if (stderr.includes("az login") || stderr.includes("not logged in") || stderr.includes("Please run")) {
      return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    }

    return NextResponse.json({ error: "unknown", detail: "Azure CLI returned an unexpected error" }, { status: 500 });
  }
}
