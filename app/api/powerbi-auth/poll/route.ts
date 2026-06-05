import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

interface PollBody {
  deviceCode: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function POST(req: NextRequest) {
  const { deviceCode } = (await req.json()) as PollBody;

  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: CLIENT_ID,
        device_code: deviceCode,
      }),
    }
  );

  const data = (await res.json()) as TokenResponse;

  if (res.ok && data.access_token) {
    const expiresOn = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    return NextResponse.json({ status: "success", accessToken: data.access_token, expiresOn });
  }

  switch (data.error) {
    case "authorization_pending":
      return NextResponse.json({ status: "pending" });
    case "slow_down":
      return NextResponse.json({ status: "pending" });
    case "expired_token":
      return NextResponse.json({ status: "expired" });
    case "authorization_declined":
      return NextResponse.json({ status: "declined" });
    default:
      return NextResponse.json({ status: "error", detail: data.error_description ?? data.error });
  }
}
