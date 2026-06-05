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
    const error = err as NodeJS.ErrnoException & { stderr?: string; code?: number };

    if (error.code === "ENOENT" || (error.message ?? "").includes("az: not found") || (error.message ?? "").includes("az.cmd")) {
      return NextResponse.json({ error: "azure_cli_not_found" }, { status: 503 });
    }

    const stderr = error.stderr ?? "";
    if (stderr.includes("az login") || stderr.includes("not logged in") || stderr.includes("Please run")) {
      return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    }

    return NextResponse.json({ error: "unknown", detail: error.message }, { status: 500 });
  }
}
