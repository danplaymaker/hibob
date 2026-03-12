import type { HiBobApiResponse, HiBobJob, HiBobRawRecord } from "../types/jobs";
import { logger } from "./logger";

const HIBOB_SEARCH_URL = "https://api.hibob.com/v1/hiring/job-ads/search";

// HiBob's /search endpoint scopes fields within the jobAd namespace automatically.
// Sending "jobAd/id" causes the API to look for "/jobAd/jobAd/id" (double-prefix).
// The correct format is just the bare field name.
const REQUEST_FIELDS = [
  "id",
  "title",
  "site",
  "description",
  "applyUrl",
  "requirements",
  "responsibilities",
  "benefits",
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
  // HiBob returns fields as leading-slash paths with { value } wrappers:
  // { "/jobAd/id": { value: "abc123" }, "/jobAd/title": { value: "..." }, ... }
  const id = raw["/jobAd/id"]?.value;

  if (!id) {
    logger.warn("hibob: record missing /jobAd/id — skipping", { raw });
    return null;
  }

  return {
    id,
    title: raw["/jobAd/title"]?.value ?? "",
    site: raw["/jobAd/site"]?.value ?? "",
    description: raw["/jobAd/description"]?.value ?? "",
    applyUrl: raw["/jobAd/applyUrl"]?.value ?? "",
    requirements: raw["/jobAd/requirements"]?.value ?? "",
    responsibilities: raw["/jobAd/responsibilities"]?.value ?? "",
    benefits: raw["/jobAd/benefits"]?.value ?? "",
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

  // The API returns a bare array. Fall back to wrapped variants defensively.
  const rawRecords: HiBobRawRecord[] = Array.isArray(payload)
    ? (payload as unknown as HiBobRawRecord[])
    : payload.jobAds ?? payload.jobs ?? payload.data ?? [];

  if (!Array.isArray(rawRecords)) {
    logger.warn("hibob: unexpected response shape — treating as empty", {
      keys: Object.keys(payload as object),
    });
    return [];
  }

  if (rawRecords.length === 0) {
    logger.warn("hibob: API returned zero job ads — verify filters/tenant");
  }

  // Log the raw keys from the first record so we can verify field names
  if (rawRecords.length > 0) {
    logger.info("hibob: first raw record keys (for field verification)", {
      keys: Object.keys(rawRecords[0]!),
    });
  }

  const jobs: HiBobJob[] = [];
  for (const raw of rawRecords) {
    const job = normaliseRecord(raw);
    if (job) jobs.push(job);
  }

  logger.info("hibob: fetched job ads", { count: jobs.length });
  return jobs;
}
