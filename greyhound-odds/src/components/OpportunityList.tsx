"use client";

import { RunnerAnalysis } from "@/lib/types";
import { SignalBadge } from "./SignalBadge";
import { EdgeCell } from "./EdgeCell";
import { MovementCell } from "./MovementCell";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function OpportunityList({
  opportunities,
  onSelectRunner,
}: {
  opportunities: RunnerAnalysis[];
  onSelectRunner: (raceId: string, runnerId: string) => void;
}) {
  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        No opportunities detected. Adjust filters or wait for market movement.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {opportunities.map((a, i) => (
        <div
          key={a.runner.id}
          className="border border-[var(--border)] rounded-lg p-3 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors flex items-center gap-4"
          onClick={() => onSelectRunner(a.race.id, a.runner.id)}
        >
          {/* Rank */}
          <div className="text-lg font-bold text-[var(--text-muted)] w-8 text-center shrink-0">
            {i + 1}
          </div>

          {/* Runner info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {a.runner.name}
              </span>
              <span className="text-xs text-[var(--text-muted)]">T{a.runner.trap}</span>
              <SignalBadge signal={a.signal} />
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {a.race.track} R{a.race.raceNumber} &middot;{" "}
              {new Date(a.race.raceTime).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              &middot; {a.runner.bookmakerSource}
            </div>
          </div>

          {/* Key metrics */}
          <div className="flex items-center gap-5 text-xs shrink-0">
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Bookie</div>
              <div className="font-medium tabular-nums">
                {a.runner.bookmakerOdds?.toFixed(2) ?? "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">BF Mid</div>
              <div className="font-medium tabular-nums">
                {a.betfairMidpoint?.toFixed(2) ?? "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Edge</div>
              <EdgeCell value={a.edgeVsMidpoint} />
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">5m</div>
              <MovementCell value={a.movement5m} />
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Conf</div>
              <ConfidenceBadge confidence={a.confidence} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
