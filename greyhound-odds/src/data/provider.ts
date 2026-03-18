import { OddsDataProvider } from "../lib/types";
import { mockProvider } from "./mock-provider";

/**
 * Data provider registry.
 *
 * Available providers:
 *   "mock"      — Mock data for development/demo (default)
 *   "betfair"   — Live Betfair Exchange data (requires API credentials)
 *   "composite" — Betfair + bookmaker odds (requires Betfair + bookmaker source)
 *
 * Set the ODDS_PROVIDER environment variable to switch providers.
 *
 * Required env vars for Betfair:
 *   BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD
 *
 * Optional env vars for cert-based auth:
 *   BETFAIR_CERT_PATH, BETFAIR_KEY_PATH
 */

let cachedProvider: OddsDataProvider | null = null;

export function getProvider(): OddsDataProvider {
  if (cachedProvider) return cachedProvider;

  const id = process.env.ODDS_PROVIDER ?? "mock";

  switch (id) {
    case "betfair": {
      // Lazy import to avoid loading Betfair deps when using mock
      const { BetfairProvider } = require("./betfair");
      cachedProvider = new BetfairProvider();
      break;
    }

    case "composite": {
      const { BetfairProvider } = require("./betfair");
      const { CompositeProvider } = require("./composite-provider");
      const { OddscheckerBookmakerSource } = require("./oddschecker");
      const bookmaker = process.env.ODDSCHECKER_BOOKMAKER ?? "Bet365";
      cachedProvider = new CompositeProvider(
        new BetfairProvider(),
        new OddscheckerBookmakerSource({ bookmaker })
      );
      break;
    }

    case "mock":
      cachedProvider = mockProvider;
      break;

    default:
      console.warn(`Unknown provider "${id}", falling back to mock`);
      cachedProvider = mockProvider;
  }

  console.log(`[Provider] Using ${cachedProvider!.name} (${cachedProvider!.id})`);
  return cachedProvider!;
}

/**
 * Reset the cached provider (useful for testing or hot-reloading config).
 */
export function resetProvider(): void {
  cachedProvider = null;
}
