/**
 * Betfair Exchange API type definitions.
 *
 * These map directly to the Betfair JSON-RPC API schemas.
 * Reference: https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Betting+Type+Definitions
 */

// ─── Authentication ──────────────────────────────────────────────────────────

export interface BetfairLoginResponse {
  sessionToken: string;
  loginStatus:
    | "SUCCESS"
    | "INVALID_USERNAME_OR_PASSWORD"
    | "ACCOUNT_NOW_LOCKED"
    | "ACCOUNT_ALREADY_LOCKED"
    | "PENDING_AUTH"
    | "TELBET_TERMS_CONDITIONS_NA"
    | "DUPLICATE_CARDS"
    | "SECURITY_QUESTION_WRONG_3X"
    | "KYC_SUSPEND"
    | "SUSPENDED"
    | "CLOSED"
    | "SELF_EXCLUDED"
    | "INVALID_CONNECTIVITY_TO_REGULATOR_DK"
    | "NOT_AUTHORIZED_BY_REGULATOR_DK"
    | "INVALID_CONNECTIVITY_TO_REGULATOR_IT"
    | "NOT_AUTHORIZED_BY_REGULATOR_IT"
    | "SECURITY_RESTRICTED_LOCATION"
    | "BETTING_RESTRICTED_LOCATION"
    | "TRADING_MASTER"
    | "TRADING_MASTER_SUSPENDED"
    | "AGENT_CLIENT_MASTER"
    | "AGENT_CLIENT_MASTER_SUSPENDED"
    | "DANISH_AUTHORIZATION_REQUIRED"
    | "SPAIN_MIGRATION_REQUIRED"
    | "DENMARK_MIGRATION_REQUIRED"
    | "OTP_REQUIRED"
    | "INPUT_VALIDATION_ERROR"
    | "PERSONAL_MESSAGE_REQUIRED";
}

// ─── Betting API ─────────────────────────────────────────────────────────────

export interface BetfairMarketFilter {
  eventTypeIds?: string[];
  marketCountries?: string[];
  marketTypeCodes?: string[];
  marketStartTime?: BetfairTimeRange;
  competitionIds?: string[];
  eventIds?: string[];
  marketIds?: string[];
}

export interface BetfairTimeRange {
  from?: string; // ISO
  to?: string;
}

export interface BetfairMarketCatalogue {
  marketId: string;
  marketName: string;
  marketStartTime: string; // ISO
  totalMatched?: number;
  event?: BetfairEvent;
  competition?: BetfairCompetition;
  runners?: BetfairRunnerCatalogue[];
}

export interface BetfairEvent {
  id: string;
  name: string;
  countryCode?: string;
  timezone?: string;
  venue?: string;
  openDate?: string;
}

export interface BetfairCompetition {
  id: string;
  name: string;
}

export interface BetfairRunnerCatalogue {
  selectionId: number;
  runnerName: string;
  sortPriority: number; // trap number for greyhounds
  handicap?: number;
}

export interface BetfairMarketBook {
  marketId: string;
  isMarketDataDelayed: boolean;
  status: "INACTIVE" | "OPEN" | "SUSPENDED" | "CLOSED";
  betDelay: number;
  numberOfActiveRunners: number;
  totalMatched?: number;
  totalAvailable?: number;
  runners: BetfairRunnerBook[];
}

export interface BetfairRunnerBook {
  selectionId: number;
  status: "ACTIVE" | "WINNER" | "LOSER" | "REMOVED" | "HIDDEN";
  totalMatched?: number;
  ex?: BetfairExchangePrices;
}

export interface BetfairExchangePrices {
  availableToBack?: BetfairPriceSize[];
  availableToLay?: BetfairPriceSize[];
  tradedVolume?: BetfairPriceSize[];
}

export interface BetfairPriceSize {
  price: number;
  size: number;
}

// ─── Price Projection ────────────────────────────────────────────────────────

export type BetfairPriceProjection = {
  priceData?: ("SP_AVAILABLE" | "SP_TRADED" | "EX_BEST_OFFERS" | "EX_ALL_OFFERS" | "EX_TRADED")[];
  virtualise?: boolean;
  rolloverLimit?: number;
};

// ─── API Request/Response Wrappers ───────────────────────────────────────────

export interface BetfairJsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: number;
}

export interface BetfairJsonRpcResponse<T> {
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: {
      APINGException?: {
        errorCode: string;
        errorDetails?: string;
      };
    };
  };
  id: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Betfair event type ID for greyhound racing */
export const GREYHOUND_EVENT_TYPE_ID = "4339";

/** Betfair market type for Win markets */
export const WIN_MARKET_TYPE = "WIN";
