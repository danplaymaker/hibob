/**
 * POST /api/sync-jobs
 * GET  /api/sync-jobs  (returns health / last-run info)
 *
 * Manual trigger endpoint. Protected by SYNC_SECRET bearer token.
 *
 * Examples:
 *   curl -X POST https://your-app.vercel.app/api/sync-jobs \
 *        -H "Authorization: Bearer <SYNC_SECRET>"
 *
 *   curl "https://your-app.vercel.app/api/sync-jobs?token=<SYNC_SECRET>"
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthorized, rejectUnauthorized } from "./lib/auth";
import { logger } from "./lib/logger";
import { runSync } from "./lib/sync";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // -----------------------------------------------------------------------
  // Auth gate
  // -----------------------------------------------------------------------
  if (!isAuthorized(req)) {
    rejectUnauthorized(res);
    return;
  }

  // -----------------------------------------------------------------------
  // Health / status check (GET)
  // -----------------------------------------------------------------------
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        message: "POST to this endpoint to trigger a manual sync.",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Sync trigger (POST)
  // -----------------------------------------------------------------------
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  logger.info("sync-jobs: manual sync triggered", {
    ip: req.headers["x-forwarded-for"] ?? req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  });

  try {
    const result = await runSync();

    const statusCode = result.errors.length > 0 ? 207 : 200;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, result }));
  } catch (err) {
    logger.error("sync-jobs: unhandled error during sync", { error: String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: "Sync failed. Check logs for details.",
        detail: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
