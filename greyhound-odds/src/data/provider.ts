import { OddsDataProvider } from "../lib/types";
import { mockProvider } from "./mock-provider";

/**
 * Data provider registry.
 *
 * To add a live data source:
 * 1. Create a new file (e.g., betfair-provider.ts) implementing OddsDataProvider
 * 2. Register it here
 * 3. Set ODDS_PROVIDER env var to switch
 *
 * Integration points for live data:
 *
 * - Betfair Exchange API:
 *   Implement OddsDataProvider using the Betfair Exchange Stream API or polling API.
 *   You'll need: BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD, BETFAIR_CERT_PATH.
 *   Map Betfair market catalogue → Race, runner catalogue → Runner,
 *   and listMarketBook → back/lay prices + matched volume.
 *
 * - Bookmaker odds (Sky Bet, Coral, etc.):
 *   Options: Oddschecker scraping, Odds API (the-odds-api.com), or direct feeds.
 *   Implement as a separate provider or as an overlay that merges bookmaker odds
 *   into the Betfair-sourced Race objects.
 *
 * - Hybrid approach (recommended):
 *   Use Betfair as primary, merge in bookmaker odds from a secondary source.
 *   Create a CompositeProvider that combines both.
 */

const providers: Record<string, OddsDataProvider> = {
  mock: mockProvider,
  // betfair: betfairProvider,   // Phase 2
  // composite: compositeProvider, // Phase 2
};

export function getProvider(): OddsDataProvider {
  const id = process.env.ODDS_PROVIDER ?? "mock";
  const provider = providers[id];
  if (!provider) {
    console.warn(`Unknown provider "${id}", falling back to mock`);
    return mockProvider;
  }
  return provider;
}
