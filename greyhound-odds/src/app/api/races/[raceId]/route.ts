import { NextResponse } from "next/server";
import { getProvider } from "@/data/provider";
import { analyseRunner, explainSignal } from "@/lib/calculations";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ raceId: string }> }
) {
  const { raceId } = await params;
  const provider = getProvider();
  const race = await provider.getRace(raceId);

  if (!race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  const now = new Date();
  const runners = race.runners.map((runner) => {
    const analysis = analyseRunner(runner, race, DEFAULT_SETTINGS, now);
    return {
      ...analysis,
      explanation: explainSignal(analysis),
    };
  });

  return NextResponse.json({ race, runners });
}
