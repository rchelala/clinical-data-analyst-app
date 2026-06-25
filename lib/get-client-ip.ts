import { NextRequest } from "next/server";

// Vercel always sets x-forwarded-for in production. Locally it's usually
// absent, so every local request falls into one shared "unknown" bucket —
// fine for dev, since rate limiting only matters in production.
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",")[0].trim();
}
