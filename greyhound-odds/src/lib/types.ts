// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface Race {
  id: string;
  track: string;
  raceTime: string; // ISO timestamp
  raceNumber: number;
  runners: Runner[];
  status: "upcoming" | "off" | "result";
}

export interface Runner {
  id: string;
  raceId: string;
  name: string;
  trap: number;
  bookmakerOdds: number | null;
  bookmakerSource: string;
  betfairBackOdds: number | null;
  betfairLayOdds: number | null;
  betfairMatchedVolume: number; // £ matched on this selection
  betfairTotalMatched: number; // £ matched on entire market
  priceHistory: PriceSnapshot[];
}

export interface PriceSnapshot {
  timestamp: string; // ISO timestamp
  betfairBack: number | null;
  betfairLay: number | null;
  bookmakerOdds: number | null;
}

// ─── Calculated / Derived Types ──────────────────────────────────────────────

export interface RunnerAnalysis {
  runner: Runner;
  race: Race;
  betfairMidpoint: number | null;
  edgeVsMidpoint: number | null; // percentage
  edgeVsLay: number | null;
  edgeVsBack: number | null;
  movement1m: number | null; // percentage change in midpoint
  movement3m: number | null;
  movement5m: number | null;
  movement10m: number | null;
  confidence: ConfidenceScore;
  signal: Signal;
  minutesToOff: number;
}

export type Signal =
  | "strong-value"
  | "watch"
  | "no-edge"
  | "drifting"
  | "low-liquidity";

export interface ConfidenceScore {
  value: number; // 0–100
  label: "high" | "medium" | "low";
  reasons: string[];
}

// ─── Alert Types ─────────────────────────────────────────────────────────────

export interface AlertRule {
  id: string;
  enabled: boolean;
  name: string;
  minEdgePercent: number | null; // notify when edge > X%
  minShorteningPercent: number | null; // notify when Betfair shortens > Y%
  shorteningWindowMinutes: number | null; // over Z minutes
  requireBoth: boolean; // both conditions must be true
}

export interface Alert {
  id: string;
  ruleId: string;
  runnerId: string;
  raceId: string;
  timestamp: string;
  message: string;
  dismissed: boolean;
}

// ─── Settings / Config ───────────────────────────────────────────────────────

export interface AppSettings {
  // Signal thresholds
  strongValueMinEdge: number;
  strongValueMinShortening: number;
  strongValueMinLiquidity: number;
  strongValueMaxSpread: number;
  watchMinEdge: number;
  lowLiquidityThreshold: number;
  wideSpreadThreshold: number;

  // Filters
  minEdgeFilter: number;
  minLiquidityFilter: number;
  maxMinutesToOff: number;

  // Alerts
  alertRules: AlertRule[];
  soundEnabled: boolean;
  browserNotificationsEnabled: boolean;

  // Polling
  pollIntervalMs: number;

  // Watchlist
  watchlist: string[]; // runner IDs
}

export const DEFAULT_SETTINGS: AppSettings = {
  strongValueMinEdge: 15,
  strongValueMinShortening: 5,
  strongValueMinLiquidity: 500,
  strongValueMaxSpread: 0.15, // as fraction of midpoint
  watchMinEdge: 8,
  lowLiquidityThreshold: 100,
  wideSpreadThreshold: 0.3,

  minEdgeFilter: 0,
  minLiquidityFilter: 0,
  maxMinutesToOff: 60,

  alertRules: [],
  soundEnabled: true,
  browserNotificationsEnabled: false,

  pollIntervalMs: 5000,

  watchlist: [],
};

// ─── Data Provider Interface ─────────────────────────────────────────────────

/**
 * Abstraction layer for odds data sources.
 * Implement this interface for each data source (mock, Betfair API, scraper, etc.)
 */
export interface OddsDataProvider {
  /** Unique identifier for this provider */
  readonly id: string;
  readonly name: string;

  /** Fetch upcoming races with current odds */
  getRaces(): Promise<Race[]>;

  /** Fetch a single race by ID */
  getRace(raceId: string): Promise<Race | null>;

  /** Fetch historical price snapshots for a runner */
  getRunnerHistory(runnerId: string): Promise<PriceSnapshot[]>;
}
