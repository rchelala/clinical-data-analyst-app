import { NextRequest } from "next/server";

// Netlify sets x-nf-client-connection-ip to the real client IP itself, at the
// edge — a client cannot override it, so it's the trustworthy source. Prefer
// it. x-forwarded-for is only a fallback: it's client-settable (a client can
// rotate it to bypass IP-based rate limiting) and we keep it solely so local
// dev still resolves to something. Locally both headers are usually absent,
// so every local request falls into one shared "unknown" bucket — fine for
// dev, since rate limiting only matters in production.
export function getClientIp(req: NextRequest): string {
  const nfClientIp = req.headers.get("x-nf-client-connection-ip");
  if (nfClientIp) return nfClientIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",")[0].trim();
}
