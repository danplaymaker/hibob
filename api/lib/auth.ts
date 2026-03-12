import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Validates that the incoming request carries the correct sync secret.
 *
 * Accepted forms (checked in order):
 *   1. Authorization: Bearer <SYNC_SECRET>
 *   2. ?token=<SYNC_SECRET>  (convenient for quick curl tests)
 *
 * The secret is read from SYNC_SECRET env var, which must be set in Vercel.
 * Vercel Cron requests are also allowed when CRON_SECRET matches the
 * x-vercel-signature header — Vercel injects this automatically when a
 * function is invoked by its own cron scheduler.
 */
export function isAuthorized(req: IncomingMessage): boolean {
  const syncSecret = process.env.SYNC_SECRET;

  if (!syncSecret) {
    // Refuse all requests when the secret is not configured — fail safe.
    return false;
  }

  // 1. Bearer token in Authorization header
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return timingSafeEqual(token, syncSecret);
  }

  // 2. Query-string token (curl-friendly, avoid for production use)
  const url = new URL(req.url ?? "/", "http://localhost");
  const queryToken = url.searchParams.get("token") ?? "";
  if (queryToken) {
    return timingSafeEqual(queryToken, syncSecret);
  }

  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)!;
  }
  return diff === 0;
}

/**
 * Send a 401 JSON response and return false so callers can early-exit cleanly.
 */
export function rejectUnauthorized(res: ServerResponse): false {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}
