import { NextResponse } from "next/server";
import { getProvider } from "@/data/provider";
import { analyseRunner, rankOpportunities } from "@/lib/calculations";
import { DEFAULT_SETTINGS, RunnerAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode"); // "all" | "opportunities"
  const minEdge = parseFloat(searchParams.get("minEdge") ?? "0");
  const minLiquidity = parseFloat(searchParams.get("minLiquidity") ?? "0");
  const maxMinutes = parseFloat(searchParams.get("maxMinutes") ?? "120");

  const provider = getProvider();
  const races = await provider.getRaces();
  const now = new Date();

  // Analyse all runners
  const allAnalyses: RunnerAnalysis[] = [];
  for (const race of races) {
    if (race.status === "off") continue;
    for (const runner of race.runners) {
      const analysis = analyseRunner(runner, race, DEFAULT_SETTINGS, now);

      // Apply filters
      if (analysis.minutesToOff > maxMinutes) continue;
      if (minEdge > 0 && (analysis.edgeVsMidpoint ?? 0) < minEdge) continue;
      if (minLiquidity > 0 && runner.betfairMatchedVolume < minLiquidity) continue;

      allAnalyses.push(analysis);
    }
  }

  if (mode === "opportunities") {
    return NextResponse.json({
      opportunities: rankOpportunities(allAnalyses),
      total: allAnalyses.length,
    });
  }

  // Group by race for dashboard view
  const raceMap = new Map<string, { race: typeof races[0]; runners: RunnerAnalysis[] }>();
  for (const a of allAnalyses) {
    if (!raceMap.has(a.race.id)) {
      raceMap.set(a.race.id, { race: a.race, runners: [] });
    }
    raceMap.get(a.race.id)!.runners.push(a);
  }

  const result = Array.from(raceMap.values()).sort(
    (a, b) => new Date(a.race.raceTime).getTime() - new Date(b.race.raceTime).getTime()
  );

  return NextResponse.json({ races: result, total: allAnalyses.length });
}
