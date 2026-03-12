/**
 * GET /api/cron/sync
 *
 * Vercel Cron handler — invoked automatically on the schedule defined in
 * vercel.json ("0 * * * *" = top of every hour).
 *
 * Vercel authenticates its own cron requests using the CRON_SECRET env var
 * and the `Authorization: Bearer <CRON_SECRET>` header it injects. We
 * validate this to prevent external callers from abusing the cron endpoint.
 *
 * Docs: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "../lib/logger";
import { runSync } from "../lib/sync";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Vercel validates CRON_SECRET automatically when you set it as an env var.
  // We add an explicit check here as a defence-in-depth measure.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"] ?? "";
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (cronSecret && providedToken !== cronSecret) {
    logger.warn("cron/sync: unauthorised request — rejecting", {
      ip: req.headers["x-forwarded-for"],
    });
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  logger.info("cron/sync: scheduled sync started");

  try {
    const result = await runSync();

    logger.info("cron/sync: scheduled sync finished", {
      jobsFetched: result.jobsFetched,
      created: result.created,
      updated: result.updated,
      deactivated: result.deactivated,
      skipped: result.skipped,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    });

    // Vercel expects a 200 to consider the cron run successful.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, result }));
  } catch (err) {
    logger.error("cron/sync: unhandled error", { error: String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
