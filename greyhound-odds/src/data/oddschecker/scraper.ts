import puppeteer, { Browser, Page } from "puppeteer-core";
import { BOOKMAKER_CODES, ScrapedRaceOdds, ScrapedRunnerOdds, RaceLink } from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = "https://www.oddschecker.com";
const GREYHOUNDS_URL = `${BASE_URL}/greyhounds`;

/** How long to wait for the odds table to appear (ms) */
const TABLE_WAIT_MS = 10_000;

/** Delay between page loads to avoid rate limiting (ms) */
const INTER_REQUEST_DELAY_MS = 2_000;

/** Max concurrent race page fetches */
const MAX_CONCURRENCY = 2;

// ─── Scraper ────────────────────────────────────────────────────────────────

/**
 * Oddschecker greyhound odds scraper.
 *
 * Uses Puppeteer (headless Chrome) to render Oddschecker's JS-heavy pages,
 * then extracts the odds comparison table.
 *
 * Usage:
 *   const scraper = new OddscheckerScraper();
 *   await scraper.init();
 *   const races = await scraper.scrapeUpcomingRaces();
 *   await scraper.close();
 *
 * The scraper is designed to be long-lived — call init() once, then
 * scrapeUpcomingRaces() on each poll interval.
 */
export class OddscheckerScraper {
  private browser: Browser | null = null;

  async init(): Promise<void> {
    if (this.browser) return;

    const executablePath =
      process.env.CHROME_PATH ??
      process.env.PUPPETEER_EXECUTABLE_PATH ??
      "/usr/bin/google-chrome";

    this.browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    console.log("[Oddschecker] Browser launched");
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log("[Oddschecker] Browser closed");
    }
  }

  /**
   * Scrape odds for all upcoming greyhound races currently listed on Oddschecker.
   */
  async scrapeUpcomingRaces(): Promise<ScrapedRaceOdds[]> {
    await this.ensureBrowser();

    const raceLinks = await this.getRaceLinks();
    if (raceLinks.length === 0) {
      console.warn("[Oddschecker] No greyhound race links found");
      return [];
    }

    console.log(`[Oddschecker] Found ${raceLinks.length} race links`);

    // Scrape races in batches to limit concurrency
    const results: ScrapedRaceOdds[] = [];
    for (let i = 0; i < raceLinks.length; i += MAX_CONCURRENCY) {
      const batch = raceLinks.slice(i, i + MAX_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((link) => this.scrapeRacePage(link))
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          results.push(result.value);
        } else if (result.status === "rejected") {
          console.warn(`[Oddschecker] Race scrape failed: ${result.reason}`);
        }
      }

      // Delay between batches
      if (i + MAX_CONCURRENCY < raceLinks.length) {
        await delay(INTER_REQUEST_DELAY_MS);
      }
    }

    return results;
  }

  /**
   * Scrape odds for a single race, matched by track name and time.
   * Returns null if the race isn't found on Oddschecker.
   */
  async scrapeRace(track: string, raceTime: string): Promise<ScrapedRaceOdds | null> {
    await this.ensureBrowser();

    const raceLinks = await this.getRaceLinks();
    const target = findMatchingRace(raceLinks, track, raceTime);

    if (!target) {
      console.warn(`[Oddschecker] No matching race found for ${track} @ ${raceTime}`);
      return null;
    }

    return this.scrapeRacePage(target);
  }

  // ─── Internal Methods ──────────────────────────────────────────────────

  /**
   * Fetch the greyhounds landing page and extract links to individual races.
   */
  private async getRaceLinks(): Promise<RaceLink[]> {
    const page = await this.newPage();

    try {
      await page.goto(GREYHOUNDS_URL, { waitUntil: "domcontentloaded", timeout: 15_000 });

      // Wait for race cards to appear
      await page.waitForSelector("a[href*='/greyhounds/']", { timeout: TABLE_WAIT_MS }).catch(() => {});

      const links = await page.evaluate((baseUrl: string) => {
        const results: { track: string; time: string; url: string }[] = [];

        // Oddschecker lists races as links with venue and time info.
        // Look for links that point to individual race markets.
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          "a[href*='/greyhounds/']"
        );

        for (const a of anchors) {
          const href = a.getAttribute("href");
          if (!href) continue;

          // Race URLs follow pattern: /greyhounds/{venue}/{time}/winner
          // or similar with the race identifier
          const match = href.match(/\/greyhounds\/([^/]+)\/([^/]+)(?:\/winner)?$/);
          if (!match) continue;

          const venue = match[1]
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const timeOrSlug = match[2];

          // Extract visible time text if available
          const timeText = a.textContent?.trim() ?? "";
          const timeMatch = timeText.match(/(\d{1,2}:\d{2})/);
          const time = timeMatch ? timeMatch[1] : timeOrSlug;

          results.push({
            track: venue,
            time,
            url: href.startsWith("http") ? href : `${baseUrl}${href}`,
          });
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        return results.filter((r) => {
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        });
      }, BASE_URL);

      return links;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape the odds comparison table from a single race page.
   */
  private async scrapeRacePage(raceLink: RaceLink): Promise<ScrapedRaceOdds | null> {
    const page = await this.newPage();

    try {
      await page.goto(raceLink.url, { waitUntil: "domcontentloaded", timeout: 15_000 });

      // Wait for the odds table to render
      await page.waitForSelector("table.eventTable, [data-testid='odds-table'], table[class*='event']", {
        timeout: TABLE_WAIT_MS,
      }).catch(() => {});

      // Small delay for JS rendering
      await delay(1_000);

      const scraped = await page.evaluate((bookmakerCodes: Record<string, string>) => {
        // ─── Helper: Convert fractional odds string to decimal ───
        function fracToDecimal(oddsStr: string): number | null {
          if (!oddsStr || oddsStr === "" || oddsStr === "-" || oddsStr === "N/A") return null;

          // Already decimal
          if (/^\d+\.\d+$/.test(oddsStr)) return parseFloat(oddsStr);

          // Fractional: "5/2" → 3.5
          const fracMatch = oddsStr.match(/^(\d+)\/(\d+)$/);
          if (fracMatch) {
            return parseInt(fracMatch[1]) / parseInt(fracMatch[2]) + 1;
          }

          // EVS/evens
          if (/^evs$/i.test(oddsStr.trim())) return 2.0;

          return null;
        }

        // ─── Find the odds table ───
        const table =
          document.querySelector("table.eventTable") ??
          document.querySelector("[data-testid='odds-table']") ??
          document.querySelector("table[class*='event']");

        if (!table) return null;

        // ─── Extract bookmaker columns from header ───
        // Header cells often have data-bk attributes or contain bookie identifiers
        const headerRow = table.querySelector("thead tr, tr:first-child");
        const bookmakerColumns: { index: number; code: string; name: string }[] = [];

        if (headerRow) {
          const headerCells = headerRow.querySelectorAll("th, td");
          headerCells.forEach((cell, idx) => {
            const bk = cell.getAttribute("data-bk");
            if (bk && bookmakerCodes[bk]) {
              bookmakerColumns.push({ index: idx, code: bk, name: bookmakerCodes[bk] });
            }
          });
        }

        // Fallback: scan for elements with known bookie ID patterns
        if (bookmakerColumns.length === 0) {
          for (const [code, name] of Object.entries(bookmakerCodes)) {
            const el = table.querySelector(`[data-bk="${code}"], td[id*="${code}"], th[id*="${code}"]`);
            if (el) {
              // Find the column index
              const row = el.closest("tr");
              if (row) {
                const cells = Array.from(row.children);
                const idx = cells.indexOf(el as Element);
                if (idx >= 0) {
                  bookmakerColumns.push({ index: idx, code, name });
                }
              }
            }
          }
        }

        if (bookmakerColumns.length === 0) return null;

        // ─── Extract runner rows ───
        const runners: {
          runnerName: string;
          trap: number | null;
          odds: Record<string, number>;
        }[] = [];

        const rows = table.querySelectorAll("tbody tr, tr[data-bname], tr.diff-row");

        for (const row of rows) {
          // Runner name from data attribute or first cell
          const runnerName =
            row.getAttribute("data-bname") ??
            row.querySelector(".popup-runner-name, .nm, [class*='runner'], td:first-child")?.textContent?.trim() ??
            "";

          if (!runnerName) continue;

          // Try to extract trap number
          const trapEl = row.querySelector(".trap, [class*='trap']");
          const trapText = trapEl?.textContent?.trim() ?? "";
          const trapMatch = trapText.match(/(\d+)/);
          const trap = trapMatch ? parseInt(trapMatch[1]) : null;

          // Extract odds for each bookmaker column
          const odds: Record<string, number> = {};
          const cells = row.querySelectorAll("td");

          for (const bookie of bookmakerColumns) {
            const cell = cells[bookie.index] ?? row.querySelector(`td[data-bk="${bookie.code}"]`);
            if (!cell) continue;

            const oddsText =
              cell.getAttribute("data-odig") ?? // Oddschecker stores decimal in data-odig
              cell.getAttribute("data-o") ??
              cell.textContent?.trim() ??
              "";

            const decimal = fracToDecimal(oddsText);
            if (decimal != null && decimal > 1) {
              odds[bookie.name] = Math.round(decimal * 100) / 100;
            }
          }

          if (Object.keys(odds).length > 0) {
            runners.push({ runnerName, trap, odds });
          }
        }

        return runners.length > 0 ? runners : null;
      }, BOOKMAKER_CODES);

      if (!scraped) {
        console.warn(`[Oddschecker] No odds data found at ${raceLink.url}`);
        return null;
      }

      // Convert to our types
      const runners: ScrapedRunnerOdds[] = scraped.map((r) => ({
        runnerName: r.runnerName,
        trap: r.trap,
        odds: new Map(Object.entries(r.odds)),
      }));

      return {
        track: raceLink.track,
        raceTime: raceLink.time,
        runners,
        scrapedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`[Oddschecker] Failed to scrape ${raceLink.url}: ${err}`);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Create a new page with realistic browser fingerprint.
   */
  private async newPage(): Promise<Page> {
    await this.ensureBrowser();
    const page = await this.browser!.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Block images, fonts, and media to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "font", "media", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser) {
      await this.init();
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find a race link matching the given track and time.
 * Uses fuzzy matching for track names (case-insensitive, partial match).
 */
function findMatchingRace(
  links: RaceLink[],
  track: string,
  raceTime: string
): RaceLink | undefined {
  const normTrack = track.toLowerCase().replace(/[^a-z]/g, "");

  // Extract HH:MM from the ISO raceTime
  const timeMatch = raceTime.match(/(\d{2}):(\d{2})/);
  const targetTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "";

  return links.find((link) => {
    const linkTrack = link.track.toLowerCase().replace(/[^a-z]/g, "");
    const trackMatch = linkTrack.includes(normTrack) || normTrack.includes(linkTrack);

    // Time matching: compare HH:MM
    const linkTimeMatch = link.time.match(/(\d{1,2}):(\d{2})/);
    const linkTime = linkTimeMatch
      ? `${linkTimeMatch[1].padStart(2, "0")}:${linkTimeMatch[2]}`
      : "";
    const timeMatches = targetTime === linkTime;

    return trackMatch && timeMatches;
  });
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let scraperInstance: OddscheckerScraper | null = null;

export function getOddscheckerScraper(): OddscheckerScraper {
  if (!scraperInstance) {
    scraperInstance = new OddscheckerScraper();
  }
  return scraperInstance;
}

export function resetOddscheckerScraper(): void {
  scraperInstance?.close();
  scraperInstance = null;
}
