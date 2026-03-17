import fs from "fs";
import https from "https";
import {
  BetfairLoginResponse,
  BetfairMarketCatalogue,
  BetfairMarketBook,
  BetfairMarketFilter,
  BetfairPriceProjection,
  BetfairJsonRpcRequest,
  BetfairJsonRpcResponse,
  GREYHOUND_EVENT_TYPE_ID,
  WIN_MARKET_TYPE,
} from "./types";

// ─── Configuration ───────────────────────────────────────────────────────────

interface BetfairClientConfig {
  appKey: string;
  username: string;
  password: string;
  /** Path to client certificate (.crt/.pem) for cert-based login */
  certPath?: string;
  /** Path to client key (.key) for cert-based login */
  keyPath?: string;
  /** Locale for API responses (default: en) */
  locale?: string;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

const CERT_LOGIN_URL = "https://identitysso-cert.betfair.com/api/certlogin";
const INTERACTIVE_LOGIN_URL = "https://identitysso.betfair.com/api/login";
const BETTING_API_URL = "https://api.betfair.com/exchange/betting/json-rpc/v1";
const KEEP_ALIVE_URL = "https://identitysso.betfair.com/api/keepAlive";

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * Betfair Exchange API client.
 *
 * Handles authentication (certificate-based or interactive login),
 * session management with auto-renewal, and all betting API calls
 * needed for the greyhound odds scanner.
 *
 * Usage:
 *   const client = new BetfairClient({ appKey, username, password, certPath, keyPath });
 *   await client.login();
 *   const races = await client.listGreyhoundMarkets();
 *   const books = await client.listMarketBook(marketIds);
 */
export class BetfairClient {
  private config: BetfairClientConfig;
  private sessionToken: string | null = null;
  private sessionExpiry: number = 0; // timestamp in ms
  private requestId: number = 0;

  /** Session tokens are valid for ~4 hours; we renew at 3 hours */
  private static SESSION_LIFETIME_MS = 3 * 60 * 60 * 1000;

  constructor(config: BetfairClientConfig) {
    this.config = config;
  }

  // ─── Authentication ──────────────────────────────────────────────────

  /**
   * Authenticate with Betfair. Prefers certificate-based login if cert/key
   * paths are provided; falls back to interactive login otherwise.
   *
   * Certificate login is recommended for automated/server use as it avoids
   * CAPTCHA and has higher rate limits.
   */
  async login(): Promise<void> {
    if (this.config.certPath && this.config.keyPath) {
      await this.certLogin();
    } else {
      await this.interactiveLogin();
    }
  }

  /**
   * Certificate-based login (recommended for server use).
   * Requires a self-signed SSL certificate registered with Betfair.
   * See: https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Non-Interactive+%28bot%29+login
   */
  private async certLogin(): Promise<void> {
    const cert = fs.readFileSync(this.config.certPath!);
    const key = fs.readFileSync(this.config.keyPath!);

    const body = `username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}`;

    const response = await this.httpsRequest(CERT_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Application": this.config.appKey,
      },
      cert,
      key,
      body,
    });

    const data: BetfairLoginResponse = JSON.parse(response);

    if (data.loginStatus !== "SUCCESS") {
      throw new Error(`Betfair cert login failed: ${data.loginStatus}`);
    }

    this.sessionToken = data.sessionToken;
    this.sessionExpiry = Date.now() + BetfairClient.SESSION_LIFETIME_MS;
    console.log("[Betfair] Certificate login successful");
  }

  /**
   * Interactive (username/password) login.
   * May require CAPTCHA for new sessions. Works for development but
   * cert-based login is preferred for production.
   */
  private async interactiveLogin(): Promise<void> {
    const body = `username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}`;

    const response = await this.httpsRequest(INTERACTIVE_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Application": this.config.appKey,
        Accept: "application/json",
      },
      body,
    });

    const data = JSON.parse(response);

    if (data.status !== "SUCCESS") {
      throw new Error(`Betfair interactive login failed: ${data.status} — ${data.error ?? "unknown"}`);
    }

    this.sessionToken = data.token;
    this.sessionExpiry = Date.now() + BetfairClient.SESSION_LIFETIME_MS;
    console.log("[Betfair] Interactive login successful");
  }

  /**
   * Keep the session alive. Call periodically (e.g. every hour) to prevent
   * the session token from expiring.
   */
  async keepAlive(): Promise<void> {
    await this.ensureSession();

    const response = await this.httpsRequest(KEEP_ALIVE_URL, {
      method: "GET",
      headers: {
        "X-Application": this.config.appKey,
        "X-Authentication": this.sessionToken!,
        Accept: "application/json",
      },
    });

    const data = JSON.parse(response);
    if (data.status === "SUCCESS") {
      this.sessionExpiry = Date.now() + BetfairClient.SESSION_LIFETIME_MS;
      console.log("[Betfair] Session kept alive");
    } else {
      console.warn("[Betfair] Keep-alive failed, re-logging in");
      await this.login();
    }
  }

  /**
   * Ensure we have a valid session. Re-authenticates if expired.
   */
  private async ensureSession(): Promise<void> {
    if (!this.sessionToken || Date.now() >= this.sessionExpiry) {
      await this.login();
    }
  }

  get isAuthenticated(): boolean {
    return this.sessionToken != null && Date.now() < this.sessionExpiry;
  }

  // ─── Betting API Methods ─────────────────────────────────────────────

  /**
   * List upcoming greyhound WIN markets for UK and Irish tracks.
   *
   * Returns market catalogue with event info and runner details.
   * Fetches markets starting from now up to `hoursAhead` hours.
   */
  async listGreyhoundMarkets(hoursAhead: number = 2): Promise<BetfairMarketCatalogue[]> {
    const now = new Date();
    const until = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const filter: BetfairMarketFilter = {
      eventTypeIds: [GREYHOUND_EVENT_TYPE_ID],
      marketTypeCodes: [WIN_MARKET_TYPE],
      marketCountries: ["GB", "IE"],
      marketStartTime: {
        from: now.toISOString(),
        to: until.toISOString(),
      },
    };

    return this.bettingApiCall<BetfairMarketCatalogue[]>(
      "SportsAPING/v1.0/listMarketCatalogue",
      {
        filter,
        marketProjection: [
          "EVENT",
          "COMPETITION",
          "RUNNER_DESCRIPTION",
          "MARKET_START_TIME",
        ],
        sort: "FIRST_TO_START",
        maxResults: 100,
        locale: this.config.locale ?? "en",
      }
    );
  }

  /**
   * Get live prices and volume for the given market IDs.
   *
   * Returns best back/lay prices and matched volume per runner.
   * This is the core call for building the price grid.
   *
   * Uses EX_BEST_OFFERS only (data weight ~5 per market, allowing up to 40
   * markets per call). Runner-level totalMatched is available without EX_TRADED,
   * which would increase weight to ~20 and reduce batch size to 10.
   *
   * @param marketIds - Array of market IDs (max 40 per call per Betfair limits)
   */
  async listMarketBook(marketIds: string[]): Promise<BetfairMarketBook[]> {
    const priceProjection: BetfairPriceProjection = {
      priceData: ["EX_BEST_OFFERS"],
      virtualise: true,
    };

    return this.bettingApiCall<BetfairMarketBook[]>(
      "SportsAPING/v1.0/listMarketBook",
      {
        marketIds,
        priceProjection,
      }
    );
  }

  // ─── JSON-RPC Transport ──────────────────────────────────────────────

  /**
   * Make a Betfair Betting API call via JSON-RPC.
   *
   * All Betfair Betting API calls go through a single endpoint using JSON-RPC.
   * The method name determines which API operation is called.
   *
   * Rate limits:
   * - Free tier: 5 requests/second per app key
   * - With data request subscription: higher limits
   * - listMarketBook with ≤40 markets counts as 1 request
   */
  private async bettingApiCall<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    await this.ensureSession();

    const request: BetfairJsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: ++this.requestId,
    };

    const response = await this.httpsRequest(BETTING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Application": this.config.appKey,
        "X-Authentication": this.sessionToken!,
        Accept: "application/json",
      },
      body: JSON.stringify([request]),
    });

    const parsed: BetfairJsonRpcResponse<T>[] = JSON.parse(response);
    const result = parsed[0];

    if (result.error) {
      const apiError = result.error.data?.APINGException;
      const errorMsg = apiError
        ? `${apiError.errorCode}: ${apiError.errorDetails ?? ""}`
        : result.error.message;
      throw new Error(`Betfair API error (${method}): ${errorMsg}`);
    }

    return result.result as T;
  }

  // ─── HTTP Transport ──────────────────────────────────────────────────

  /**
   * Low-level HTTPS request helper. We use native https to support
   * client certificate authentication without additional dependencies.
   */
  private httpsRequest(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      cert?: Buffer;
      key?: Buffer;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);

      const reqOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method,
        headers: {
          ...options.headers,
          ...(options.body
            ? { "Content-Length": Buffer.byteLength(options.body).toString() }
            : {}),
        },
        ...(options.cert ? { cert: options.cert } : {}),
        ...(options.key ? { key: options.key } : {}),
      };

      const req = https.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `HTTP ${res.statusCode} from ${parsedUrl.hostname}: ${body.slice(0, 500)}`
              )
            );
          } else {
            resolve(body);
          }
        });
      });

      req.on("error", reject);
      req.setTimeout(15000, () => {
        req.destroy(new Error(`Request timeout: ${url}`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

// ─── Singleton Factory ───────────────────────────────────────────────────────

let clientInstance: BetfairClient | null = null;

/**
 * Get or create the Betfair client singleton.
 * Reads configuration from environment variables.
 *
 * Required env vars:
 *   BETFAIR_APP_KEY   — Your Betfair application key
 *   BETFAIR_USERNAME  — Betfair account username
 *   BETFAIR_PASSWORD  — Betfair account password
 *
 * Optional env vars:
 *   BETFAIR_CERT_PATH — Path to SSL certificate for cert-based login
 *   BETFAIR_KEY_PATH  — Path to SSL private key for cert-based login
 *
 * If cert/key paths are not provided, falls back to interactive login.
 */
export function getBetfairClient(): BetfairClient {
  if (clientInstance) return clientInstance;

  const appKey = process.env.BETFAIR_APP_KEY;
  const username = process.env.BETFAIR_USERNAME;
  const password = process.env.BETFAIR_PASSWORD;

  if (!appKey || !username || !password) {
    throw new Error(
      "Missing Betfair credentials. Set BETFAIR_APP_KEY, BETFAIR_USERNAME, and BETFAIR_PASSWORD environment variables."
    );
  }

  clientInstance = new BetfairClient({
    appKey,
    username,
    password,
    certPath: process.env.BETFAIR_CERT_PATH,
    keyPath: process.env.BETFAIR_KEY_PATH,
  });

  return clientInstance;
}

/**
 * Reset the client singleton (useful for testing or credential changes).
 */
export function resetBetfairClient(): void {
  clientInstance = null;
}
