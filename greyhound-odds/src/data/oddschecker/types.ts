// ─── Oddschecker Scraper Types ──────────────────────────────────────────────

/**
 * Bookmaker identifier codes used in Oddschecker's HTML.
 * Each bookmaker has a short code embedded in element IDs/attributes.
 */
export const BOOKMAKER_CODES: Record<string, string> = {
  B3: "Bet365",
  SK: "Sky Bet",
  WH: "William Hill",
  PP: "Paddy Power",
  LB: "Ladbrokes",
  CO: "Coral",
  FR: "Betfred",
  BY: "Betway",
  OE: "10Bet",
  BO: "Boylesports",
  BV: "BetVictor",
  UN: "Unibet",
  FB: "Betfair Sportsbook",
  EE: "888sport",
  SA: "Spreadex",
  PE: "Parimatch",
  RK: "Kwiff",
  MI: "Midnite",
  WA: "Betfair Exchange",
};

/**
 * Odds scraped for a single runner from the Oddschecker table.
 */
export interface ScrapedRunnerOdds {
  runnerName: string;
  trap: number | null;
  odds: Map<string, number>; // bookmaker name → decimal odds
}

/**
 * All odds scraped from a single race page.
 */
export interface ScrapedRaceOdds {
  track: string;
  raceTime: string;
  runners: ScrapedRunnerOdds[];
  scrapedAt: string; // ISO timestamp
}

/**
 * A race link found on the Oddschecker greyhounds landing page.
 */
export interface RaceLink {
  track: string;
  time: string; // "14:30" format
  url: string;
}
