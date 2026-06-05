import { NextResponse } from "next/server";

// Azure CLI's public client ID — no App Registration required
const CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const SCOPE = "https://analysis.windows.net/powerbi/api/.default offline_access";

export async function POST() {
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: "device_code_failed", detail: text }, { status: 502 });
  }

  const data = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  return NextResponse.json({
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  });
}
