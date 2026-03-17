import { OddsDataProvider, Race, Runner, PriceSnapshot } from "../lib/types";

/**
 * Mock data provider for development and demo purposes.
 * Generates realistic-looking greyhound race data with price histories
 * that simulate various market scenarios (shortening, drifting, stale bookie, etc.)
 */

const TRACKS = [
  "Romford",
  "Crayford",
  "Monmore",
  "Sheffield",
  "Nottingham",
  "Swindon",
  "Hove",
  "Towcester",
  "Perry Barr",
  "Henlow",
];

const GREYHOUND_NAMES = [
  "Ballymac Doris",
  "Droopys Donut",
  "Romeo Magico",
  "Swift Callisto",
  "Bubbly Apache",
  "Droopys Expert",
  "Kildare Prince",
  "Cabra Bolt",
  "Westmead Alvin",
  "Bandicoot Tipoki",
  "Lenson Bocko",
  "Toolmaker Flash",
  "Rapid Ace",
  "Skywalker Fitz",
  "Deanridge Doyen",
  "Pennys Cuisle",
  "Ballymac Eske",
  "Thorn Falcon",
  "Coolavanny Jap",
  "Alien Doris",
  "Rusheen Thunder",
  "Priceless Jet",
  "Knockeen Shay",
  "Savana Gold",
  "Glenvale Gus",
  "Ballybough Mike",
  "Skidroe Charlie",
  "Swords Rex",
  "Farloe Delta",
  "Clonbrien Prince",
];

const BOOKMAKER_SOURCES = ["Sky Bet", "Coral", "Ladbrokes", "Betfred", "William Hill"];

// Seeded pseudo-random for reproducible demos
let seed = 42;
function seededRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)];
}

function roundOdds(v: number): number {
  // Round to realistic Betfair increments
  if (v < 2) return Math.round(v * 100) / 100;
  if (v < 3) return Math.round(v * 50) / 50;
  if (v < 4) return Math.round(v * 20) / 20;
  if (v < 6) return Math.round(v * 10) / 10;
  if (v < 10) return Math.round(v * 5) / 5;
  if (v < 20) return Math.round(v * 2) / 2;
  return Math.round(v);
}

type Scenario =
  | "shortening-stale-bookie" // BF shortening, bookie hasn't moved → strong value
  | "tight-market" // everything in line → no edge
  | "drifting" // BF drifting out
  | "low-liquidity" // thin market
  | "moderate-edge"; // some edge, moderate liquidity

function generatePriceHistory(
  scenario: Scenario,
  baseBack: number,
  now: Date
): { history: PriceSnapshot[]; finalBack: number; finalLay: number; bookmakerOdds: number; volume: number } {
  const snapshots: PriceSnapshot[] = [];
  const intervals = 30; // 30 snapshots over ~15 minutes
  const intervalMs = 30_000; // 30 seconds each

  let back = baseBack;
  let spread = scenario === "low-liquidity" ? 0.4 : 0.08;
  let bookmaker = baseBack;
  let volume = scenario === "low-liquidity" ? 30 : 500;

  for (let i = 0; i < intervals; i++) {
    const t = new Date(now.getTime() - (intervals - i) * intervalMs);
    const noise = (seededRandom() - 0.5) * 0.1;

    switch (scenario) {
      case "shortening-stale-bookie":
        // BF shortens gradually, bookmaker stays
        back -= 0.03 + seededRandom() * 0.02;
        volume += seededRandom() * 50;
        // Bookmaker barely moves
        if (i > intervals * 0.8 && seededRandom() > 0.7) {
          bookmaker -= 0.1;
        }
        break;

      case "tight-market":
        back += noise * 0.3;
        bookmaker = back + (seededRandom() * 0.3 - 0.1);
        volume += seededRandom() * 30;
        break;

      case "drifting":
        back += 0.04 + seededRandom() * 0.03;
        bookmaker += 0.02 + seededRandom() * 0.01;
        volume += seededRandom() * 20;
        break;

      case "low-liquidity":
        back += noise * 0.5;
        spread = 0.3 + seededRandom() * 0.3;
        bookmaker = back + seededRandom() * 1.5;
        volume += seededRandom() * 5;
        break;

      case "moderate-edge":
        back -= 0.01 + seededRandom() * 0.01;
        volume += seededRandom() * 40;
        if (i > intervals * 0.6 && seededRandom() > 0.5) {
          bookmaker -= 0.05;
        }
        break;
    }

    back = Math.max(1.1, back);
    bookmaker = Math.max(1.1, bookmaker);

    const lay = back + spread * back * 0.1;

    snapshots.push({
      timestamp: t.toISOString(),
      betfairBack: roundOdds(back),
      betfairLay: roundOdds(lay),
      bookmakerOdds: roundOdds(bookmaker),
    });
  }

  const last = snapshots[snapshots.length - 1];
  return {
    history: snapshots,
    finalBack: last.betfairBack!,
    finalLay: last.betfairLay!,
    bookmakerOdds: last.bookmakerOdds!,
    volume: Math.round(volume),
  };
}

function generateRace(index: number, now: Date): Race {
  const track = TRACKS[index % TRACKS.length];
  // Races at various offsets: some past, some upcoming
  const offsetMinutes = -5 + index * 7 + Math.floor(seededRandom() * 5);
  const raceTime = new Date(now.getTime() + offsetMinutes * 60000);

  const numRunners = 6;
  const scenarios: Scenario[] = [
    "shortening-stale-bookie",
    "moderate-edge",
    "tight-market",
    "drifting",
    "low-liquidity",
    "tight-market",
  ];

  const usedNames = new Set<string>();
  const runners: Runner[] = [];

  for (let t = 0; t < numRunners; t++) {
    let name: string;
    do {
      name = pick(GREYHOUND_NAMES);
    } while (usedNames.has(name));
    usedNames.add(name);

    const baseBack = 2 + seededRandom() * 12; // 2.0–14.0
    const scenario = scenarios[t % scenarios.length];
    const { history, finalBack, finalLay, bookmakerOdds, volume } =
      generatePriceHistory(scenario, baseBack, now);

    runners.push({
      id: `r${index}-t${t + 1}`,
      raceId: `race-${index}`,
      name,
      trap: t + 1,
      bookmakerOdds,
      bookmakerSource: pick(BOOKMAKER_SOURCES),
      betfairBackOdds: finalBack,
      betfairLayOdds: finalLay,
      betfairMatchedVolume: volume,
      betfairTotalMatched: volume * numRunners * (0.8 + seededRandom() * 0.4),
      priceHistory: history,
    });
  }

  return {
    id: `race-${index}`,
    track,
    raceTime: raceTime.toISOString(),
    raceNumber: (index % 12) + 1,
    runners,
    status: offsetMinutes < -2 ? "off" : "upcoming",
  };
}

// Generate a fixed set of mock races
function generateAllRaces(): Race[] {
  seed = 42; // reset seed for reproducibility
  const now = new Date();
  const races: Race[] = [];
  for (let i = 0; i < 10; i++) {
    races.push(generateRace(i, now));
  }
  return races;
}

let cachedRaces: Race[] | null = null;

export const mockProvider: OddsDataProvider = {
  id: "mock",
  name: "Mock Data (Demo)",

  async getRaces(): Promise<Race[]> {
    if (!cachedRaces) {
      cachedRaces = generateAllRaces();
    }
    return cachedRaces;
  },

  async getRace(raceId: string): Promise<Race | null> {
    const races = await this.getRaces();
    return races.find((r) => r.id === raceId) ?? null;
  },

  async getRunnerHistory(runnerId: string): Promise<PriceSnapshot[]> {
    const races = await this.getRaces();
    for (const race of races) {
      const runner = race.runners.find((r) => r.id === runnerId);
      if (runner) return runner.priceHistory;
    }
    return [];
  },
};

/**
 * Reset cached races (useful for testing or triggering fresh data).
 */
export function resetMockData(): void {
  cachedRaces = null;
}
