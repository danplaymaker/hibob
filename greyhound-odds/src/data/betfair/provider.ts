import {
  OddsDataProvider,
  Race,
  Runner,
  PriceSnapshot,
} from "../../lib/types";
import { getBetfairClient, BetfairClient } from "./client";
import {
  BetfairMarketCatalogue,
  BetfairMarketBook,
  BetfairRunnerBook,
  BetfairRunnerCatalogue,
} from "./types";
import { priceCache } from "./price-cache";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a unique cache key for a runner within a market */
function selectionKey(marketId: string, selectionId: number): string {
  return `${marketId}-${selectionId}`;
}

/**
 * Extract the best (top of book) back price from Betfair exchange prices.
 * Best back = highest price available to back at.
 */
function bestBack(runner: BetfairRunnerBook): number | null {
  const backs = runner.ex?.availableToBack;
  if (!backs || backs.length === 0) return null;
  // Betfair returns back prices sorted best-first (highest price first)
  return backs[0].price;
}

/**
 * Extract the best (top of book) lay price.
 * Best lay = lowest price available to lay at.
 */
function bestLay(runner: BetfairRunnerBook): number | null {
  const lays = runner.ex?.availableToLay;
  if (!lays || lays.length === 0) return null;
  // Betfair returns lay prices sorted best-first (lowest price first)
  return lays[0].price;
}

/**
 * Calculate total matched volume from traded volume ladder.
 */
function totalTraded(runner: BetfairRunnerBook): number {
  if (!runner.ex?.tradedVolume) return runner.totalMatched ?? 0;
  return runner.ex.tradedVolume.reduce((sum, tv) => sum + tv.size, 0);
}

/**
 * Parse track name from Betfair event/market name.
 * Betfair event names are typically "Romford 17th Mar" or venue names.
 * Market names are like "R1 480m Flat" etc.
 */
function parseTrack(catalogue: BetfairMarketCatalogue): string {
  // Event venue is the cleanest source
  if (catalogue.event?.venue) return catalogue.event.venue;

  // Fall back to event name, stripping date suffixes
  const eventName = catalogue.event?.name ?? "";
  // Remove date patterns like "17th Mar", "3rd Jan", etc.
  return eventName.replace(/\s+\d{1,2}(st|nd|rd|th)\s+\w+$/i, "").trim() || "Unknown";
}

/**
 * Parse race number from market name.
 * Market names are like "R1 480m Flat", "R12 265m Flat", etc.
 */
function parseRaceNumber(marketName: string): number {
  const match = marketName.match(/R(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * Betfair Exchange data provider.
 *
 * Implements OddsDataProvider using the Betfair Betting API.
 * Manages its own client lifecycle, session keep-alive, and price caching.
 *
 * Flow per getRaces() call:
 * 1. Ensure authenticated
 * 2. Fetch market catalogue (upcoming greyhound WIN markets)
 * 3. Fetch market books (live prices) in batches of ≤40
 * 4. Map Betfair structures → our Race/Runner types
 * 5. Record price snapshots in the cache
 * 6. Attach price history from cache to each runner
 *
 * Bookmaker odds are NOT populated by this provider.
 * Use the CompositeProvider to merge in bookmaker odds from another source.
 */
export class BetfairProvider implements OddsDataProvider {
  readonly id = "betfair";
  readonly name = "Betfair Exchange (Live)";

  private client: BetfairClient;
  private catalogueCache: BetfairMarketCatalogue[] = [];
  private lastCatalogueFetch: number = 0;

  /** Re-fetch catalogue every 60 seconds (runner list doesn't change often) */
  private static CATALOGUE_TTL_MS = 60_000;

  /** Max markets per listMarketBook call (Betfair limit) */
  private static MARKET_BOOK_BATCH_SIZE = 40;

  constructor(client?: BetfairClient) {
    this.client = client ?? getBetfairClient();
  }

  async getRaces(): Promise<Race[]> {
    // 1. Get market catalogue (with caching)
    const catalogues = await this.fetchCatalogue();
    if (catalogues.length === 0) return [];

    // 2. Fetch live prices in batches
    const marketIds = catalogues.map((c) => c.marketId);
    const books = await this.fetchMarketBooks(marketIds);

    // Build lookup: marketId → book
    const bookMap = new Map<string, BetfairMarketBook>();
    for (const book of books) {
      bookMap.set(book.marketId, book);
    }

    // 3. Map to our domain types
    const now = new Date().toISOString();
    const activeKeys = new Set<string>();
    const races: Race[] = [];

    for (const catalogue of catalogues) {
      const book = bookMap.get(catalogue.marketId);
      if (!book) continue;

      // Skip non-open markets
      if (book.status !== "OPEN" && book.status !== "SUSPENDED") continue;

      // Build runner lookup from catalogue (has names/trap numbers)
      const catalogueRunners = new Map<number, BetfairRunnerCatalogue>();
      if (catalogue.runners) {
        for (const r of catalogue.runners) {
          catalogueRunners.set(r.selectionId, r);
        }
      }

      const runners: Runner[] = [];
      for (const runnerBook of book.runners) {
        if (runnerBook.status !== "ACTIVE") continue;

        const catRunner = catalogueRunners.get(runnerBook.selectionId);
        if (!catRunner) continue;

        const key = selectionKey(catalogue.marketId, runnerBook.selectionId);
        activeKeys.add(key);

        const back = bestBack(runnerBook);
        const lay = bestLay(runnerBook);
        const volume = totalTraded(runnerBook);

        // Record snapshot in cache
        const snapshot: PriceSnapshot = {
          timestamp: now,
          betfairBack: back,
          betfairLay: lay,
          bookmakerOdds: null, // filled by composite provider
        };
        priceCache.record(key, snapshot);

        // Get full history from cache
        const history = priceCache.getHistory(key);

        runners.push({
          id: key,
          raceId: catalogue.marketId,
          name: catRunner.runnerName,
          trap: catRunner.sortPriority,
          bookmakerOdds: null, // filled by composite provider
          bookmakerSource: "—",
          betfairBackOdds: back,
          betfairLayOdds: lay,
          betfairMatchedVolume: volume,
          betfairTotalMatched: book.totalMatched ?? 0,
          priceHistory: history,
        });
      }

      // Sort runners by trap number
      runners.sort((a, b) => a.trap - b.trap);

      races.push({
        id: catalogue.marketId,
        track: parseTrack(catalogue),
        raceTime: catalogue.marketStartTime,
        raceNumber: parseRaceNumber(catalogue.marketName),
        runners,
        status: book.status === "SUSPENDED" ? "off" : "upcoming",
      });
    }

    // Clean up cache for markets that are no longer active
    priceCache.pruneInactiveMarkets(activeKeys);

    // Sort by race time
    races.sort(
      (a, b) => new Date(a.raceTime).getTime() - new Date(b.raceTime).getTime()
    );

    return races;
  }

  async getRace(raceId: string): Promise<Race | null> {
    const races = await this.getRaces();
    return races.find((r) => r.id === raceId) ?? null;
  }

  async getRunnerHistory(runnerId: string): Promise<PriceSnapshot[]> {
    return priceCache.getHistory(runnerId);
  }

  // ─── Internal Methods ────────────────────────────────────────────────

  /**
   * Fetch market catalogue with a simple TTL cache.
   * The catalogue (race list + runner names) changes infrequently,
   * so we avoid re-fetching it on every poll.
   */
  private async fetchCatalogue(): Promise<BetfairMarketCatalogue[]> {
    const now = Date.now();
    if (
      this.catalogueCache.length > 0 &&
      now - this.lastCatalogueFetch < BetfairProvider.CATALOGUE_TTL_MS
    ) {
      return this.catalogueCache;
    }

    this.catalogueCache = await this.client.listGreyhoundMarkets();
    this.lastCatalogueFetch = now;
    console.log(
      `[Betfair] Fetched ${this.catalogueCache.length} greyhound markets`
    );
    return this.catalogueCache;
  }

  /**
   * Fetch market books in batches (Betfair limits to 40 markets per call).
   */
  private async fetchMarketBooks(
    marketIds: string[]
  ): Promise<BetfairMarketBook[]> {
    const results: BetfairMarketBook[] = [];
    const batchSize = BetfairProvider.MARKET_BOOK_BATCH_SIZE;

    for (let i = 0; i < marketIds.length; i += batchSize) {
      const batch = marketIds.slice(i, i + batchSize);
      const books = await this.client.listMarketBook(batch);
      results.push(...books);
    }

    return results;
  }
}
