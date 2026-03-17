import { NextResponse } from "next/server";
import { getProvider } from "@/data/provider";
import { analyseRunner } from "@/lib/calculations";
import { Alert, AlertRule, DEFAULT_SETTINGS, RunnerAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts — evaluate alert rules against current market state.
 * Body: { rules: AlertRule[] }
 * Returns: { alerts: Alert[] }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const rules: AlertRule[] = body.rules ?? [];

  if (rules.length === 0) {
    return NextResponse.json({ alerts: [] });
  }

  const provider = getProvider();
  const races = await provider.getRaces();
  const now = new Date();
  const alerts: Alert[] = [];

  for (const race of races) {
    if (race.status !== "upcoming") continue;

    for (const runner of race.runners) {
      const analysis = analyseRunner(runner, race, DEFAULT_SETTINGS, now);

      for (const rule of rules) {
        if (!rule.enabled) continue;
        const triggered = evaluateRule(rule, analysis);
        if (triggered) {
          alerts.push({
            id: `alert-${rule.id}-${runner.id}-${Date.now()}`,
            ruleId: rule.id,
            runnerId: runner.id,
            raceId: race.id,
            timestamp: now.toISOString(),
            message: buildAlertMessage(rule, analysis),
            dismissed: false,
          });
        }
      }
    }
  }

  return NextResponse.json({ alerts });
}

function evaluateRule(rule: AlertRule, analysis: RunnerAnalysis): boolean {
  const edgeMet =
    rule.minEdgePercent == null ||
    (analysis.edgeVsMidpoint != null && analysis.edgeVsMidpoint >= rule.minEdgePercent);

  const shorteningMet =
    rule.minShorteningPercent == null ||
    rule.shorteningWindowMinutes == null ||
    isShorteningMet(analysis, rule.minShorteningPercent, rule.shorteningWindowMinutes);

  if (rule.requireBoth) {
    return edgeMet && shorteningMet;
  }
  // At least one must have a value and be met
  if (rule.minEdgePercent != null && edgeMet) return true;
  if (rule.minShorteningPercent != null && shorteningMet) return true;
  return false;
}

function isShorteningMet(
  analysis: RunnerAnalysis,
  minPercent: number,
  windowMinutes: number
): boolean {
  // Use the closest matching movement window
  let movement: number | null = null;
  if (windowMinutes <= 1) movement = analysis.movement1m;
  else if (windowMinutes <= 3) movement = analysis.movement3m;
  else if (windowMinutes <= 5) movement = analysis.movement5m;
  else movement = analysis.movement10m;

  // Movement is negative when shortening
  return movement != null && Math.abs(movement) >= minPercent;
}

function buildAlertMessage(rule: AlertRule, analysis: RunnerAnalysis): string {
  const parts = [`${analysis.runner.name} at ${analysis.race.track}`];

  if (analysis.edgeVsMidpoint != null) {
    parts.push(`Edge: ${analysis.edgeVsMidpoint.toFixed(1)}%`);
  }
  if (analysis.movement5m != null) {
    parts.push(`5m movement: ${analysis.movement5m.toFixed(1)}%`);
  }
  parts.push(`Signal: ${analysis.signal}`);

  return parts.join(" | ");
}
