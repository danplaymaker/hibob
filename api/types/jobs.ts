// ---------------------------------------------------------------------------
// HiBob types
// ---------------------------------------------------------------------------

/**
 * A job ad returned from the HiBob Hiring API.
 * Field names are normalised from the `jobAd/*` namespace.
 */
export interface HiBobJob {
  id: string;
  title: string;
  /** Office / location name (jobAd/site) */
  site: string;
  description: string;
  applyUrl: string;
}

/**
 * Raw shape of a single record in the HiBob API response.
 * The API nests fields under a `jobAd` key when using the /search endpoint.
 */
export interface HiBobRawRecord {
  jobAd?: {
    id?: string;
    title?: string;
    site?: string;
    description?: string;
    applyUrl?: string;
  };
}

/**
 * Top-level shape of the HiBob /hiring/job-ads/search response.
 * `jobAds` is the array returned; property name may vary — we handle
 * the most common variants defensively.
 */
export interface HiBobApiResponse {
  jobAds?: HiBobRawRecord[];
  jobs?: HiBobRawRecord[];
  data?: HiBobRawRecord[];
}

// ---------------------------------------------------------------------------
// Webflow types
// ---------------------------------------------------------------------------

/**
 * The set of CMS field slugs we write to in Webflow.
 * Slugs must match the exact slugs configured in your Webflow collection.
 */
export interface WebflowJobFieldData {
  /** Built-in Webflow name field — also used as the visible title */
  name: string;
  /** HiBob job ID — used as our idempotency key */
  "hibob-id": string;
  /** Mapped from jobAd/site */
  location: string;
  /** Full HTML description from HiBob */
  description: string;
  /** Direct application link */
  "apply-url": string;
  /** Canonical URL on your careers site */
  "job-url": string;
  /** False when the job no longer appears in HiBob */
  "is-active": boolean;
  /** ISO timestamp of the last HiBob response that included this job */
  "last-seen-at": string;
  /** ISO timestamp of the most recent sync run that touched this item */
  "synced-at": string;
}

/**
 * A Webflow CMS item as returned by the v2 API.
 */
export interface WebflowItem {
  id: string;
  isDraft: boolean;
  isArchived: boolean;
  fieldData: Record<string, unknown>;
  /** Webflow-generated slug */
  slug?: string;
  lastPublished?: string | null;
  lastUpdated?: string;
  createdOn?: string;
  cmsLocaleId?: string;
}

/**
 * Paginated list response from `GET /v2/collections/:id/items`.
 */
export interface WebflowListResponse {
  items: WebflowItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Sync result
// ---------------------------------------------------------------------------

export interface SyncErrorEntry {
  hibobId: string;
  operation: "create" | "update" | "deactivate";
  error: string;
}

export interface SyncResult {
  jobsFetched: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  errors: SyncErrorEntry[];
  durationMs: number;
  timestamp: string;
}
