import {
  Runner,
  RunnerAnalysis,
  Race,
  Signal,
  ConfidenceScore,
  PriceSnapshot,
  AppSettings,
  DEFAULT_SETTINGS,
} from "./types";

// ─── Betfair Midpoint ────────────────────────────────────────────────────────

/**
 * midpoint = (best_back + best_lay) / 2
 * Returns null if either price is missing.
 */
export function calcMidpoint(
  back: number | null,
  lay: number | null
): number | null {
  if (back == null || lay == null) return null;
  return (back + lay) / 2;
}

// ─── Edge Calculations ───────────────────────────────────────────────────────

/**
 * edge_percent = ((bookmaker_odds - reference) / reference) * 100
 * Positive = bookmaker is higher (potential value).
 * Negative = bookmaker is lower (no value).
 */
export function calcEdge(
  bookmakerOdds: number | null,
  reference: number | null
): number | null {
  if (bookmakerOdds == null || reference == null || reference <= 1) return null;
  return ((bookmakerOdds - reference) / reference) * 100;
}

// ─── Price Movement ──────────────────────────────────────────────────────────

/**
 * Calculate percentage change in midpoint price over a given window.
 * Negative = price shortened (got shorter / more likely).
 * Positive = price drifted (got longer / less likely).
 */
export function calcMovement(
  history: PriceSnapshot[],
  windowMinutes: number,
  now?: Date
): number | null {
  const currentTime = now ?? new Date();
  const cutoff = new Date(currentTime.getTime() - windowMinutes * 60 * 1000);

  // Current midpoint: use the most recent snapshot
  const latest = history[history.length - 1];
  if (!latest) return null;

  const currentMid = calcMidpoint(latest.betfairBack, latest.betfairLay);
  if (currentMid == null) return null;

  // Find the snapshot closest to (but not after) the cutoff
  let pastSnapshot: PriceSnapshot | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (new Date(history[i].timestamp) <= cutoff) {
      pastSnapshot = history[i];
      break;
    }
  }

  if (!pastSnapshot) {
    // If all snapshots are within the window, use the oldest
    pastSnapshot = history[0];
    if (!pastSnapshot) return null;
  }

  const pastMid = calcMidpoint(pastSnapshot.betfairBack, pastSnapshot.betfairLay);
  if (pastMid == null || pastMid <= 1) return null;

  // Percentage change: negative means shortened
  return ((currentMid - pastMid) / pastMid) * 100;
}

// ─── Confidence Score ────────────────────────────────────────────────────────

/**
 * Score 0–100 based on:
 * - Available liquidity (matched volume)
 * - Spread between back and lay (tighter = better)
 * - Consistency of shortening
 * - Time to race off
 */
export function calcConfidence(
  runner: Runner,
  movements: { m1: number | null; m3: number | null; m5: number | null; m10: number | null },
  minutesToOff: number,
  settings: AppSettings = DEFAULT_SETTINGS
): ConfidenceScore {
  let score = 50; // start at neutral
  const reasons: string[] = [];

  // --- Liquidity ---
  const volume = runner.betfairMatchedVolume;
  if (volume >= 2000) {
    score += 20;
    reasons.push("High liquidity");
  } else if (volume >= settings.strongValueMinLiquidity) {
    score += 10;
    reasons.push("Moderate liquidity");
  } else if (volume >= settings.lowLiquidityThreshold) {
    score += 0;
    reasons.push("Low liquidity");
  } else {
    score -= 20;
    reasons.push("Very low liquidity");
  }

  // --- Spread ---
  if (runner.betfairBackOdds != null && runner.betfairLayOdds != null) {
    const mid = calcMidpoint(runner.betfairBackOdds, runner.betfairLayOdds)!;
    const spreadFraction = (runner.betfairLayOdds - runner.betfairBackOdds) / mid;
    if (spreadFraction <= 0.05) {
      score += 15;
      reasons.push("Very tight spread");
    } else if (spreadFraction <= settings.strongValueMaxSpread) {
      score += 8;
      reasons.push("Reasonable spread");
    } else if (spreadFraction <= settings.wideSpreadThreshold) {
      score -= 5;
      reasons.push("Moderate spread");
    } else {
      score -= 15;
      reasons.push("Wide spread");
    }
  } else {
    score -= 25;
    reasons.push("Missing Betfair prices");
  }

  // --- Consistent shortening ---
  const mvs = [movements.m1, movements.m3, movements.m5, movements.m10].filter(
    (v): v is number => v != null
  );
  const shorteningCount = mvs.filter((v) => v < 0).length;
  if (shorteningCount >= 3) {
    score += 10;
    reasons.push("Consistent shortening");
  } else if (shorteningCount >= 2) {
    score += 5;
    reasons.push("Some shortening");
  } else if (mvs.length > 0 && mvs.every((v) => v > 0)) {
    score -= 10;
    reasons.push("Consistently drifting");
  }

  // --- Time to off ---
  if (minutesToOff <= 2) {
    score += 5;
    reasons.push("Close to off (prices more reliable)");
  } else if (minutesToOff <= 10) {
    score += 2;
  } else if (minutesToOff > 30) {
    score -= 5;
    reasons.push("Far from off (prices may shift)");
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const label: ConfidenceScore["label"] =
    score >= 65 ? "high" : score >= 40 ? "medium" : "low";

  return { value: score, label, reasons };
}

// ─── Signal Engine ───────────────────────────────────────────────────────────

/**
 * Rules-based signal classification.
 * All thresholds are configurable via settings.
 */
export function calcSignal(
  edgeVsMidpoint: number | null,
  edgeVsLay: number | null,
  movement5m: number | null,
  confidence: ConfidenceScore,
  runner: Runner,
  settings: AppSettings = DEFAULT_SETTINGS
): Signal {
  const back = runner.betfairBackOdds;
  const lay = runner.betfairLayOdds;

  // Low liquidity / unreliable — check first as it overrides everything
  if (runner.betfairMatchedVolume < settings.lowLiquidityThreshold) {
    return "low-liquidity";
  }
  if (back != null && lay != null) {
    const mid = calcMidpoint(back, lay)!;
    const spreadFraction = (lay - back) / mid;
    if (spreadFraction > settings.wideSpreadThreshold) {
      return "low-liquidity";
    }
  }

  // Drifting — Betfair price is moving out
  if (movement5m != null && movement5m > 3) {
    return "drifting";
  }

  // Strong value
  if (
    edgeVsMidpoint != null &&
    edgeVsMidpoint >= settings.strongValueMinEdge &&
    movement5m != null &&
    movement5m <= -settings.strongValueMinShortening &&
    confidence.label !== "low"
  ) {
    return "strong-value";
  }

  // Watch
  if (edgeVsMidpoint != null && edgeVsMidpoint >= settings.watchMinEdge) {
    return "watch";
  }

  return "no-edge";
}

// ─── Full Runner Analysis ────────────────────────────────────────────────────

export function analyseRunner(
  runner: Runner,
  race: Race,
  settings: AppSettings = DEFAULT_SETTINGS,
  now?: Date
): RunnerAnalysis {
  const currentTime = now ?? new Date();
  const minutesToOff =
    (new Date(race.raceTime).getTime() - currentTime.getTime()) / 60000;

  const midpoint = calcMidpoint(runner.betfairBackOdds, runner.betfairLayOdds);
  const edgeVsMidpoint = calcEdge(runner.bookmakerOdds, midpoint);
  const edgeVsLay = calcEdge(runner.bookmakerOdds, runner.betfairLayOdds);
  const edgeVsBack = calcEdge(runner.bookmakerOdds, runner.betfairBackOdds);

  const history = runner.priceHistory;
  const movement1m = calcMovement(history, 1, currentTime);
  const movement3m = calcMovement(history, 3, currentTime);
  const movement5m = calcMovement(history, 5, currentTime);
  const movement10m = calcMovement(history, 10, currentTime);

  const confidence = calcConfidence(
    runner,
    { m1: movement1m, m3: movement3m, m5: movement5m, m10: movement10m },
    minutesToOff,
    settings
  );

  const signal = calcSignal(
    edgeVsMidpoint,
    edgeVsLay,
    movement5m,
    confidence,
    runner,
    settings
  );

  return {
    runner,
    race,
    betfairMidpoint: midpoint,
    edgeVsMidpoint,
    edgeVsLay,
    edgeVsBack,
    movement1m,
    movement3m,
    movement5m,
    movement10m,
    confidence,
    signal,
    minutesToOff,
  };
}

// ─── Opportunity Ranking ─────────────────────────────────────────────────────

/**
 * Rank runners by best potential edge.
 * Composite score considers edge magnitude, shortening, confidence, and time.
 */
export function rankOpportunities(
  analyses: RunnerAnalysis[]
): RunnerAnalysis[] {
  return [...analyses]
    .filter((a) => a.signal === "strong-value" || a.signal === "watch")
    .sort((a, b) => {
      const scoreA = opportunityScore(a);
      const scoreB = opportunityScore(b);
      return scoreB - scoreA;
    });
}

function opportunityScore(a: RunnerAnalysis): number {
  let score = 0;

  // Edge vs midpoint is the primary factor
  if (a.edgeVsMidpoint != null) score += a.edgeVsMidpoint * 2;

  // Edge vs lay as secondary
  if (a.edgeVsLay != null) score += a.edgeVsLay;

  // Recent shortening boosts the score (movement is negative when shortening)
  if (a.movement5m != null && a.movement5m < 0) score += Math.abs(a.movement5m) * 3;

  // Confidence multiplier
  score *= a.confidence.value / 100;

  // Proximity bonus: races closer to off get priority
  if (a.minutesToOff <= 5) score *= 1.3;
  else if (a.minutesToOff <= 15) score *= 1.1;

  return score;
}

// ─── Signal Explanation ──────────────────────────────────────────────────────

/**
 * Generate a plain-English explanation of why a signal was assigned.
 */
export function explainSignal(analysis: RunnerAnalysis): string {
  const { runner, betfairMidpoint, edgeVsMidpoint, movement5m, confidence, signal } = analysis;
  const parts: string[] = [];

  if (signal === "low-liquidity") {
    return `Insufficient liquidity or wide spread on Betfair for ${runner.name}. Prices may be unreliable.`;
  }

  // Describe Betfair movement
  if (movement5m != null) {
    if (movement5m < -5) {
      parts.push(
        `Betfair has shortened significantly (${movement5m.toFixed(1)}%) in the last 5 minutes`
      );
    } else if (movement5m < 0) {
      parts.push(
        `Betfair has shortened slightly (${movement5m.toFixed(1)}%) in the last 5 minutes`
      );
    } else if (movement5m > 3) {
      parts.push(
        `Betfair is drifting (+${movement5m.toFixed(1)}%) over the last 5 minutes`
      );
    }
  }

  // Describe bookmaker vs Betfair
  if (
    runner.bookmakerOdds != null &&
    betfairMidpoint != null &&
    edgeVsMidpoint != null
  ) {
    parts.push(
      `while ${runner.bookmakerSource} remains at ${runner.bookmakerOdds.toFixed(1)}. Current discrepancy is ${edgeVsMidpoint > 0 ? "+" : ""}${edgeVsMidpoint.toFixed(1)}% vs Betfair midpoint (${betfairMidpoint.toFixed(2)})`
    );
  }

  // Confidence
  parts.push(
    `Liquidity is ${confidence.label}${confidence.reasons.length > 0 ? " (" + confidence.reasons.slice(0, 2).join(", ") + ")" : ""}`
  );

  // Conclusion
  if (signal === "strong-value") {
    parts.push("This may indicate stale bookmaker pricing — potential value opportunity.");
  } else if (signal === "watch") {
    parts.push("Worth monitoring for further movement.");
  } else if (signal === "drifting") {
    parts.push("Betfair is drifting, reducing confidence in any bookmaker edge.");
  } else {
    parts.push("No significant edge detected.");
  }

  return parts.join(". ") + ".";
}
