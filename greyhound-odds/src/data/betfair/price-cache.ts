import { PriceSnapshot } from "../../lib/types";

/**
 * In-memory price history cache.
 *
 * Stores rolling price snapshots per runner (keyed by Betfair selectionId).
 * Each poll cycle pushes a new snapshot; old snapshots beyond the retention
 * window are pruned automatically.
 *
 * This allows the app to calculate price movement over 1m, 3m, 5m, 10m
 * windows even though the Betfair API only returns current prices.
 *
 * For persistence across restarts, this could be backed by SQLite or Redis
 * in a future phase.
 */

interface CacheEntry {
  snapshots: PriceSnapshot[];
}

/** Maximum age of snapshots to retain (15 minutes covers all movement windows) */
const MAX_RETENTION_MS = 15 * 60 * 1000;

/** Maximum number of snapshots per runner (safety limit) */
const MAX_SNAPSHOTS_PER_RUNNER = 200;

class PriceCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Record a price snapshot for a runner.
   *
   * @param selectionKey - Unique key for the runner (e.g. "marketId-selectionId")
   * @param snapshot - The price data to record
   */
  record(selectionKey: string, snapshot: PriceSnapshot): void {
    let entry = this.cache.get(selectionKey);
    if (!entry) {
      entry = { snapshots: [] };
      this.cache.set(selectionKey, entry);
    }

    entry.snapshots.push(snapshot);

    // Prune old snapshots
    this.prune(entry);
  }

  /**
   * Get price history for a runner.
   *
   * @param selectionKey - Unique key for the runner
   * @returns Array of snapshots sorted by timestamp (oldest first)
   */
  getHistory(selectionKey: string): PriceSnapshot[] {
    const entry = this.cache.get(selectionKey);
    if (!entry) return [];
    return [...entry.snapshots];
  }

  /**
   * Remove snapshots older than the retention window and enforce max count.
   */
  private prune(entry: CacheEntry): void {
    const cutoff = new Date(Date.now() - MAX_RETENTION_MS).toISOString();

    // Remove old snapshots
    entry.snapshots = entry.snapshots.filter((s) => s.timestamp >= cutoff);

    // Enforce max count (keep most recent)
    if (entry.snapshots.length > MAX_SNAPSHOTS_PER_RUNNER) {
      entry.snapshots = entry.snapshots.slice(-MAX_SNAPSHOTS_PER_RUNNER);
    }
  }

  /**
   * Remove all cached data for markets that are no longer active.
   * Call this after fetching the market catalogue to clean up finished races.
   *
   * @param activeKeys - Set of selectionKeys that are still active
   */
  pruneInactiveMarkets(activeKeys: Set<string>): void {
    for (const key of this.cache.keys()) {
      if (!activeKeys.has(key)) {
        this.cache.delete(key);
      }
    }
  }

  /** Number of runners currently being tracked */
  get size(): number {
    return this.cache.size;
  }

  /** Total number of snapshots across all runners */
  get totalSnapshots(): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      count += entry.snapshots.length;
    }
    return count;
  }

  /** Clear all cached data */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const priceCache = new PriceCache();
