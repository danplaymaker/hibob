import { OddsDataProvider, Race, PriceSnapshot, Runner } from "../lib/types";

/**
 * Composite data provider that merges Betfair exchange data with bookmaker odds.
 *
 * This is the recommended production setup:
 * - Primary source: Betfair Exchange (prices, volume, runner info)
 * - Secondary source: Bookmaker odds overlay
 *
 * The composite provider fetches races from Betfair, then enriches each runner
 * with bookmaker odds from the secondary source by matching on runner name.
 *
 * Bookmaker source options (implement BookmakerOddsSource):
 * - OddscheckerBookmakerSource — scrapes Oddschecker for Bet365 + other UK bookie odds
 * - Manual input / CSV (future)
 */

export interface BookmakerOddsSource {
  readonly name: string;

  /**
   * Fetch current bookmaker odds for a specific race.
   * Returns a map of runner name (normalised) → odds.
   *
   * @param track - Track name (e.g. "Romford")
   * @param raceTime - Race start time (ISO string)
   */
  getOddsForRace(
    track: string,
    raceTime: string
  ): Promise<Map<string, { odds: number; source: string }>>;
}

export class CompositeProvider implements OddsDataProvider {
  readonly id = "composite";
  readonly name = "Betfair + Bookmaker (Live)";

  constructor(
    private betfairProvider: OddsDataProvider,
    private bookmakerSource: BookmakerOddsSource | null = null
  ) {}

  async getRaces(): Promise<Race[]> {
    const races = await this.betfairProvider.getRaces();

    if (!this.bookmakerSource) return races;

    // Enrich each race with bookmaker odds
    const enriched = await Promise.all(
      races.map((race) => this.enrichWithBookmakerOdds(race))
    );

    return enriched;
  }

  async getRace(raceId: string): Promise<Race | null> {
    const race = await this.betfairProvider.getRace(raceId);
    if (!race || !this.bookmakerSource) return race;
    return this.enrichWithBookmakerOdds(race);
  }

  async getRunnerHistory(runnerId: string): Promise<PriceSnapshot[]> {
    return this.betfairProvider.getRunnerHistory(runnerId);
  }

  /**
   * Match bookmaker odds to runners by normalised name.
   * Runner names vary between sources, so we normalise for matching.
   */
  private async enrichWithBookmakerOdds(race: Race): Promise<Race> {
    if (!this.bookmakerSource) return race;

    try {
      const oddsMap = await this.bookmakerSource.getOddsForRace(
        race.track,
        race.raceTime
      );

      if (oddsMap.size === 0) return race;

      const enrichedRunners: Runner[] = race.runners.map((runner) => {
        const normalised = normaliseName(runner.name);

        // Try exact match first, then fuzzy
        let match = oddsMap.get(normalised);
        if (!match) {
          // Try matching on surname only (common in greyhound naming)
          for (const [key, value] of oddsMap) {
            if (fuzzyNameMatch(normalised, key)) {
              match = value;
              break;
            }
          }
        }

        if (match) {
          // Also update the latest price snapshot with bookmaker odds
          const updatedHistory = [...runner.priceHistory];
          if (updatedHistory.length > 0) {
            const latest = updatedHistory[updatedHistory.length - 1];
            updatedHistory[updatedHistory.length - 1] = {
              ...latest,
              bookmakerOdds: match.odds,
            };
          }

          return {
            ...runner,
            bookmakerOdds: match.odds,
            bookmakerSource: match.source,
            priceHistory: updatedHistory,
          };
        }

        return runner;
      });

      return { ...race, runners: enrichedRunners };
    } catch (err) {
      console.warn(
        `[Composite] Failed to fetch bookmaker odds for ${race.track}: ${err}`
      );
      return race;
    }
  }
}

// ─── Name Normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a greyhound name for cross-source matching.
 * Strips common prefixes, punctuation, extra whitespace, and lowercases.
 */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fuzzy match two normalised greyhound names.
 * Handles minor spelling variations and word order differences.
 */
function fuzzyNameMatch(a: string, b: string): boolean {
  if (a === b) return true;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Check word overlap (greyhound names are typically 2 words)
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  const overlap = wordsA.filter((w) => wordsB.includes(w));

  // If at least half the words match, consider it a match
  return overlap.length >= Math.min(wordsA.length, wordsB.length) * 0.5;
}
