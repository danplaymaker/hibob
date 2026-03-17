import { NextResponse } from "next/server";
import { getProvider } from "@/data/provider";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — Health check and provider status.
 *
 * Returns:
 * - Current data provider in use
 * - Whether Betfair is authenticated (if using Betfair provider)
 * - Price cache stats
 * - Timestamp
 */
export async function GET() {
  const provider = getProvider();

  const status: Record<string, unknown> = {
    provider: {
      id: provider.id,
      name: provider.name,
    },
    timestamp: new Date().toISOString(),
  };

  // Add Betfair-specific status if applicable
  if (provider.id === "betfair" || provider.id === "composite") {
    try {
      const { getBetfairClient, priceCache } = await import("@/data/betfair");
      const client = getBetfairClient();

      status.betfair = {
        authenticated: client.isAuthenticated,
      };

      status.cache = {
        trackedRunners: priceCache.size,
        totalSnapshots: priceCache.totalSnapshots,
      };
    } catch (err) {
      status.betfair = {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return NextResponse.json(status);
}
