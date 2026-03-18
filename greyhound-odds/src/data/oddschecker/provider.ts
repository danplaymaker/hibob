import { BookmakerOddsSource } from "../composite-provider";
import { OddscheckerScraper, getOddscheckerScraper } from "./scraper";
import { ScrapedRaceOdds } from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────

/** Which bookmaker to use as the primary price source */
const DEFAULT_BOOKMAKER = "Bet365";

/** How long to cache scraped odds before re-fetching (ms) */
const CACHE_TTL_MS = 30_000; // 30 seconds

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * BookmakerOddsSource implementation backed by Oddschecker scraping.
 *
 * Scrapes the Oddschecker greyhound odds comparison table to get prices
 * from UK bookmakers. Defaults to Bet365 as the primary source, but
 * falls back to other bookmakers if Bet365 odds aren't available for
 * a particular runner.
 *
 * Caches scraped data for 30 seconds to avoid hammering Oddschecker
 * on every poll cycle.
 */
export class OddscheckerBookmakerSource implements BookmakerOddsSource {
  readonly name: string;

  private scraper: OddscheckerScraper;
  private preferredBookmaker: string;
  private fallbackBookmakers: string[];

  /** Cache: all recently scraped races */
  private cachedRaces: ScrapedRaceOdds[] = [];
  private cacheTimestamp: number = 0;

  constructor(options?: {
    bookmaker?: string;
    fallbacks?: string[];
    scraper?: OddscheckerScraper;
  }) {
    this.preferredBookmaker = options?.bookmaker ?? DEFAULT_BOOKMAKER;
    this.fallbackBookmakers = options?.fallbacks ?? [
      "Coral",
      "Ladbrokes",
      "William Hill",
      "Betfred",
      "Paddy Power",
      "Sky Bet",
    ];
    this.scraper = options?.scraper ?? getOddscheckerScraper();
    this.name = `Oddschecker (${this.preferredBookmaker})`;
  }

  async getOddsForRace(
    track: string,
    raceTime: string
  ): Promise<Map<string, { odds: number; source: string }>> {
    const races = await this.getScrapedRaces();

    // Find the matching race
    const race = this.findRace(races, track, raceTime);
    if (!race) {
      return new Map();
    }

    // Build the odds map, preferring the configured bookmaker
    const result = new Map<string, { odds: number; source: string }>();

    for (const runner of race.runners) {
      const normName = runner.runnerName
        .toLowerCase()
        .replace(/[''`]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Try preferred bookmaker first
      let odds = runner.odds.get(this.preferredBookmaker);
      let source = this.preferredBookmaker;

      // Fall back through alternatives
      if (odds == null) {
        for (const fallback of this.fallbackBookmakers) {
          odds = runner.odds.get(fallback);
          if (odds != null) {
            source = fallback;
            break;
          }
        }
      }

      if (odds != null) {
        result.set(normName, { odds, source });
      }
    }

    return result;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async getScrapedRaces(): Promise<ScrapedRaceOdds[]> {
    const now = Date.now();

    if (now - this.cacheTimestamp < CACHE_TTL_MS && this.cachedRaces.length > 0) {
      return this.cachedRaces;
    }

    try {
      this.cachedRaces = await this.scraper.scrapeUpcomingRaces();
      this.cacheTimestamp = now;
      console.log(
        `[Oddschecker] Scraped ${this.cachedRaces.length} races, ` +
          `${this.cachedRaces.reduce((n, r) => n + r.runners.length, 0)} runners`
      );
    } catch (err) {
      console.error(`[Oddschecker] Scrape failed: ${err}`);
      // Return stale cache rather than nothing
    }

    return this.cachedRaces;
  }

  /**
   * Match a scraped race to a Betfair race by track name and time.
   */
  private findRace(
    races: ScrapedRaceOdds[],
    track: string,
    raceTime: string
  ): ScrapedRaceOdds | undefined {
    const normTrack = track.toLowerCase().replace(/[^a-z]/g, "");

    // Extract HH:MM from ISO timestamp
    const isoMatch = raceTime.match(/(\d{2}):(\d{2})/);
    const targetTime = isoMatch ? `${isoMatch[1]}:${isoMatch[2]}` : "";

    return races.find((race) => {
      const raceTrack = race.track.toLowerCase().replace(/[^a-z]/g, "");
      const trackMatch =
        raceTrack.includes(normTrack) || normTrack.includes(raceTrack);

      const raceTimeMatch = race.raceTime.match(/(\d{1,2}):(\d{2})/);
      const raceHHMM = raceTimeMatch
        ? `${raceTimeMatch[1].padStart(2, "0")}:${raceTimeMatch[2]}`
        : "";

      return trackMatch && targetTime === raceHHMM;
    });
  }
}
