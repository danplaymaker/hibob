import type {
  WebflowItem,
  WebflowJobFieldData,
  WebflowListResponse,
} from "../types/jobs";
import { logger } from "./logger";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const PAGE_SIZE = 100; // Webflow v2 max items per page
/** ms to wait between mutating API calls to stay under Webflow's rate limit (60 req/min) */
const WRITE_DELAY_MS = 1100;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    throw new Error(
      "Missing Webflow credentials. Set WEBFLOW_API_TOKEN environment variable."
    );
  }
  return token;
}

function getCollectionId(): string {
  const id = process.env.WEBFLOW_COLLECTION_ID;
  if (!id) {
    throw new Error(
      "Missing Webflow collection. Set WEBFLOW_COLLECTION_ID environment variable."
    );
  }
  return id;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "accept-version": "1.0.0",
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Thin fetch wrapper that throws with a structured error on non-2xx responses.
 */
async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${WEBFLOW_BASE}${path}`;
  let response: Response;

  try {
    response = await fetch(url, { ...init, headers: headers() });
  } catch (err) {
    throw new Error(`webflow: network error on ${path} — ${String(err)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `webflow: ${init.method ?? "GET"} ${path} → ${response.status} ${response.statusText}. Body: ${body}`
    );
  }

  // Some endpoints return 204 with no body
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`webflow: failed to parse JSON from ${path}: ${text.slice(0, 200)}`);
  }
}

/** Introduce a small pause between write operations to respect rate limits. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Collection item CRUD
// ---------------------------------------------------------------------------

/**
 * Fetches ALL items in the Jobs collection by paginating through all pages.
 * Returns every item regardless of draft / published state.
 */
export async function fetchAllWebflowJobs(): Promise<WebflowItem[]> {
  const collectionId = getCollectionId();
  const allItems: WebflowItem[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await apiFetch<WebflowListResponse>(
      `/collections/${collectionId}/items?limit=${PAGE_SIZE}&offset=${offset}`
    );

    allItems.push(...page.items);
    total = page.pagination.total;
    offset += page.items.length;

    logger.debug("webflow: fetched page of items", {
      fetched: allItems.length,
      total,
    });

    // Avoid hammering the API if there are many pages
    if (offset < total) await sleep(300);
  }

  logger.info("webflow: fetched all collection items", {
    count: allItems.length,
  });

  // Log the actual field slugs from the first item so we can verify they match our schema
  if (allItems.length > 0) {
    logger.info("webflow: first item field keys (for schema verification)", {
      fieldKeys: Object.keys(allItems[0]!.fieldData),
    });
  }

  return allItems;
}

/**
 * Creates a new CMS item and optionally publishes it immediately.
 */
export async function createWebflowJob(
  fieldData: WebflowJobFieldData
): Promise<WebflowItem> {
  const collectionId = getCollectionId();

  const item = await apiFetch<WebflowItem>(
    `/collections/${collectionId}/items`,
    {
      method: "POST",
      body: JSON.stringify({ fieldData, isDraft: false }),
    }
  );

  await sleep(WRITE_DELAY_MS);

  // Publish the newly created item so it appears on the live site
  try {
    await publishItems([item.id]);
  } catch (err) {
    // Non-fatal: the item exists but won't be visible until manually published
    logger.warn("webflow: publish after create failed — item created as draft", {
      itemId: item.id,
      error: String(err),
    });
  }

  return item;
}

/**
 * Partially updates an existing CMS item's fieldData.
 * Only the provided fields are changed; others are left untouched.
 */
export async function updateWebflowJob(
  itemId: string,
  fieldData: Partial<WebflowJobFieldData>
): Promise<WebflowItem> {
  const collectionId = getCollectionId();

  const item = await apiFetch<WebflowItem>(
    `/collections/${collectionId}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fieldData }),
    }
  );

  await sleep(WRITE_DELAY_MS);

  // Re-publish the updated item so changes go live
  try {
    await publishItems([itemId]);
  } catch (err) {
    logger.warn("webflow: publish after update failed — changes saved but not live", {
      itemId,
      error: String(err),
    });
  }

  return item;
}

/**
 * Marks a job as inactive:
 *   - sets is-active = false and updated timestamps in fieldData
 *   - sets isDraft = true to unpublish it from the live site
 *
 * We use PATCH so we only touch the relevant fields, leaving all other
 * content (title, description, …) intact for audit purposes.
 */
export async function deactivateWebflowJob(itemId: string): Promise<void> {
  const collectionId = getCollectionId();

  await apiFetch(`/collections/${collectionId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fieldData: { is_active: false },
      isDraft: true,
    }),
  });

  await sleep(WRITE_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Publish helpers
// ---------------------------------------------------------------------------

/**
 * Publishes a batch of item IDs in a single API call.
 * Webflow allows up to 100 IDs per request.
 */
export async function publishItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;

  const collectionId = getCollectionId();

  // Chunk into batches of 100 (Webflow limit)
  for (let i = 0; i < itemIds.length; i += 100) {
    const chunk = itemIds.slice(i, i + 100);
    await apiFetch(`/collections/${collectionId}/items/publish`, {
      method: "POST",
      body: JSON.stringify({ itemIds: chunk }),
    });
    if (i + 100 < itemIds.length) await sleep(WRITE_DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Convenience lookup builder
// ---------------------------------------------------------------------------

/**
 * Builds a Map from hibob-id → WebflowItem for fast O(1) lookups during sync.
 * Items that have no hibob-id field set are silently skipped.
 */
export function buildHibobIdIndex(items: WebflowItem[]): Map<string, WebflowItem> {
  const index = new Map<string, WebflowItem>();
  for (const item of items) {
    const hibobId = item.fieldData["hibob_id"];
    if (typeof hibobId === "string" && hibobId) {
      index.set(hibobId, item);
    }
  }
  return index;
}
