import type { HiBobJob, SyncErrorEntry, SyncResult, WebflowJobFieldData } from "../types/jobs";
import { fetchActiveJobs } from "./hibob";
import { logger } from "./logger";
import {
  buildHibobIdIndex,
  createWebflowJob,
  deactivateWebflowJob,
  fetchAllWebflowJobs,
  updateWebflowJob,
} from "./webflow";

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

function buildFieldData(job: HiBobJob, now: string): WebflowJobFieldData {
  return {
    name: job.title,
    "hibob-id": job.id,
    location: job.site,
    description: job.description,
    "apply-url": job.applyUrl,
    "job-url": `/careers/${job.id}`,
    "is-active": true,
    "last-seen-at": now,
    "synced-at": now,
  };
}

/**
 * Determines whether a Webflow item needs to be updated by comparing
 * the values we would write against what is currently stored.
 *
 * Only compares the mutable content fields; timestamps are always refreshed
 * so we skip them here to avoid unnecessary writes.
 */
function needsUpdate(
  existing: Record<string, unknown>,
  incoming: WebflowJobFieldData
): boolean {
  const fields: Array<keyof WebflowJobFieldData> = [
    "name",
    "location",
    "description",
    "apply-url",
    "job-url",
    "is-active",
  ];

  for (const field of fields) {
    if (existing[field] !== incoming[field]) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full HiBob → Webflow sync:
 *   1. Fetch active jobs from HiBob
 *   2. Fetch all existing items from Webflow
 *   3. Create or update each HiBob job in Webflow
 *   4. Deactivate any Webflow items whose HiBob job is gone
 *
 * This function is idempotent — running it twice with the same HiBob data
 * will not produce duplicates or unnecessary writes.
 */
export async function runSync(): Promise<SyncResult> {
  const startedAt = Date.now();
  const now = new Date().toISOString();

  const result: SyncResult = {
    jobsFetched: 0,
    created: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
    timestamp: now,
  };

  // ------------------------------------------------------------------
  // Step 1: Fetch active jobs from HiBob
  // ------------------------------------------------------------------
  let hibobJobs: HiBobJob[];
  try {
    hibobJobs = await fetchActiveJobs();
  } catch (err) {
    // Fatal: we cannot proceed without knowing the current state of HiBob.
    // Re-throw so the caller can return a 500 and the error appears in logs.
    logger.error("sync: failed to fetch jobs from HiBob — aborting", {
      error: String(err),
    });
    throw err;
  }

  result.jobsFetched = hibobJobs.length;

  if (hibobJobs.length === 0) {
    logger.warn(
      "sync: HiBob returned 0 jobs — skipping upsert phase to avoid mass-deactivation. " +
        "If this is intentional, remove this guard."
    );
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // Build a fast lookup set of IDs that are live in HiBob right now
  const liveHibobIds = new Set(hibobJobs.map((j) => j.id));

  // ------------------------------------------------------------------
  // Step 2: Fetch all existing Webflow items
  // ------------------------------------------------------------------
  let webflowItems;
  try {
    webflowItems = await fetchAllWebflowJobs();
  } catch (err) {
    logger.error("sync: failed to fetch items from Webflow — aborting", {
      error: String(err),
    });
    throw err;
  }

  // Build index: hibob-id → Webflow item
  const existingByHibobId = buildHibobIdIndex(webflowItems);

  // ------------------------------------------------------------------
  // Step 3: Upsert each HiBob job into Webflow
  // ------------------------------------------------------------------
  logger.info("sync: starting upsert phase", { jobs: hibobJobs.length });

  for (const job of hibobJobs) {
    const fieldData = buildFieldData(job, now);
    const existing = existingByHibobId.get(job.id);

    if (!existing) {
      // New job — create it
      try {
        await createWebflowJob(fieldData);
        result.created++;
        logger.info("sync: created job", { hibobId: job.id, title: job.title });
      } catch (err) {
        const entry: SyncErrorEntry = {
          hibobId: job.id,
          operation: "create",
          error: String(err),
        };
        result.errors.push(entry);
        logger.error("sync: failed to create job", { ...entry });
      }
      continue;
    }

    // Existing job — check if we actually need to update it
    const reactivating = existing.fieldData["is-active"] === false;

    if (!reactivating && !needsUpdate(existing.fieldData, fieldData)) {
      result.skipped++;
      logger.debug("sync: skipped unchanged job", { hibobId: job.id });
      continue;
    }

    // Update required (content changed, or job was previously inactive)
    try {
      await updateWebflowJob(existing.id, fieldData);
      result.updated++;
      logger.info("sync: updated job", {
        hibobId: job.id,
        title: job.title,
        reactivated: reactivating,
      });
    } catch (err) {
      const entry: SyncErrorEntry = {
        hibobId: job.id,
        operation: "update",
        error: String(err),
      };
      result.errors.push(entry);
      logger.error("sync: failed to update job", { ...entry });
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Deactivate jobs that are no longer in HiBob
  // ------------------------------------------------------------------
  const itemsToDeactivate = webflowItems.filter((item) => {
    const hibobId = item.fieldData["hibob-id"];
    if (typeof hibobId !== "string" || !hibobId) return false;
    // Only deactivate items that are currently active AND not in HiBob anymore
    return !liveHibobIds.has(hibobId) && item.fieldData["is-active"] !== false;
  });

  if (itemsToDeactivate.length > 0) {
    logger.info("sync: deactivating stale jobs", { count: itemsToDeactivate.length });
  }

  for (const item of itemsToDeactivate) {
    const hibobId = item.fieldData["hibob-id"] as string;
    try {
      await deactivateWebflowJob(item.id);
      result.deactivated++;
      logger.info("sync: deactivated job", { hibobId, webflowItemId: item.id });
    } catch (err) {
      const entry: SyncErrorEntry = {
        hibobId,
        operation: "deactivate",
        error: String(err),
      };
      result.errors.push(entry);
      logger.error("sync: failed to deactivate job", { ...entry });
    }
  }

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  result.durationMs = Date.now() - startedAt;

  logger.info("sync: completed", {
    jobsFetched: result.jobsFetched,
    created: result.created,
    updated: result.updated,
    deactivated: result.deactivated,
    skipped: result.skipped,
    errorCount: result.errors.length,
    durationMs: result.durationMs,
  });

  return result;
}
