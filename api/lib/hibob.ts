import type { HiBobApiResponse, HiBobJob, HiBobRawRecord } from "../types/jobs";
import { logger } from "./logger";

const HIBOB_SEARCH_URL = "https://api.hibob.com/v1/hiring/job-ads/search";

const REQUEST_FIELDS = [
  "jobAd/id",
  "jobAd/title",
  "jobAd/site",
  "jobAd/description",
  "jobAd/applyUrl",
] as const;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function buildAuthHeader(): string {
  const apiId = process.env.HIBOB_API_ID;
  const apiToken = process.env.HIBOB_API_TOKEN;

  if (!apiId || !apiToken) {
    throw new Error(
      "Missing HiBob credentials. Set HIBOB_API_ID and HIBOB_API_TOKEN environment variables."
    );
  }

  const encoded = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
  return `Basic ${encoded}`;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * HiBob returns records where job fields are nested under a `jobAd` key.
 * This function defensively normalises one raw record into our typed shape,
 * discarding records that are missing the mandatory `id` field.
 */
function normaliseRecord(raw: HiBobRawRecord): HiBobJob | null {
  const j = raw.jobAd;

  if (!j) {
    logger.warn("hibob: record missing `jobAd` key — skipping", { raw });
    return null;
  }

  if (!j.id) {
    logger.warn("hibob: record missing `jobAd.id` — skipping", { raw });
    return null;
  }

  return {
    id: j.id,
    title: j.title ?? "",
    site: j.site ?? "",
    description: j.description ?? "",
    applyUrl: j.applyUrl ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches all active job ads from HiBob Hiring API.
 *
 * @returns Array of normalised job records (empty array if HiBob returns none).
 * @throws  On auth failure (401/403) or unexpected server errors (5xx).
 */
export async function fetchActiveJobs(): Promise<HiBobJob[]> {
  logger.info("hibob: fetching active job ads");

  let response: Response;
  try {
    response = await fetch(HIBOB_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        filters: [],
        fields: REQUEST_FIELDS,
      }),
    });
  } catch (err) {
    throw new Error(`hibob: network error — ${String(err)}`);
  }

  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `hibob: authentication failed (${response.status}). ` +
        `Check HIBOB_API_ID / HIBOB_API_TOKEN. Response: ${body}`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `hibob: API error ${response.status} ${response.statusText}. Response: ${body}`
    );
  }

  let payload: HiBobApiResponse;
  try {
    payload = (await response.json()) as HiBobApiResponse;
  } catch {
    throw new Error("hibob: failed to parse JSON response");
  }

  // HiBob wraps the array under `jobAds` (documented) but we handle variants
  // defensively in case a future API version changes the key.
  const rawRecords: HiBobRawRecord[] =
    payload.jobAds ?? payload.jobs ?? payload.data ?? [];

  if (!Array.isArray(rawRecords)) {
    logger.warn("hibob: unexpected response shape — treating as empty", {
      keys: Object.keys(payload as object),
    });
    return [];
  }

  if (rawRecords.length === 0) {
    logger.warn("hibob: API returned zero job ads — verify filters/tenant");
  }

  const jobs: HiBobJob[] = [];
  for (const raw of rawRecords) {
    const job = normaliseRecord(raw);
    if (job) jobs.push(job);
  }

  logger.info("hibob: fetched job ads", { count: jobs.length });
  return jobs;
}
