"use client";

import { RunnerAnalysis } from "@/lib/types";
import { SignalBadge } from "./SignalBadge";
import { OddsCell } from "./OddsCell";
import { EdgeCell } from "./EdgeCell";
import { MovementCell } from "./MovementCell";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface RaceGroup {
  race: {
    id: string;
    track: string;
    raceTime: string;
    raceNumber: number;
    status: string;
  };
  runners: RunnerAnalysis[];
}

export function RaceTable({
  races,
  watchlist,
  onToggleWatchlist,
  onSelectRunner,
}: {
  races: RaceGroup[];
  watchlist: Set<string>;
  onToggleWatchlist: (id: string) => void;
  onSelectRunner: (raceId: string, runnerId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {races.map((rg) => (
        <div
          key={rg.race.id}
          className="border border-[var(--border)] rounded-lg overflow-hidden"
        >
          {/* Race header */}
          <div className="bg-[var(--bg-secondary)] px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase">
                {rg.race.track}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                R{rg.race.raceNumber}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatRaceTime(rg.race.raceTime)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {formatMinutesToOff(rg.race.raceTime)}
            </span>
          </div>

          {/* Runners table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="px-3 py-2 text-left w-6"></th>
                  <th className="px-3 py-2 text-left">Trap</th>
                  <th className="px-3 py-2 text-left">Runner</th>
                  <th className="px-3 py-2 text-right">Bookie</th>
                  <th className="px-3 py-2 text-right">BF Back</th>
                  <th className="px-3 py-2 text-right">BF Lay</th>
                  <th className="px-3 py-2 text-right">BF Mid</th>
                  <th className="px-3 py-2 text-right">Edge%</th>
                  <th className="px-3 py-2 text-right">1m</th>
                  <th className="px-3 py-2 text-right">3m</th>
                  <th className="px-3 py-2 text-right">5m</th>
                  <th className="px-3 py-2 text-right">10m</th>
                  <th className="px-3 py-2 text-right">Conf</th>
                  <th className="px-3 py-2 text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {rg.runners.map((a) => (
                  <tr
                    key={a.runner.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                    onClick={() => onSelectRunner(a.race.id, a.runner.id)}
                  >
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(a.runner.id);
                        }}
                        className={`text-sm ${
                          watchlist.has(a.runner.id)
                            ? "text-[var(--amber)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                        title="Toggle watchlist"
                      >
                        {watchlist.has(a.runner.id) ? "\u2605" : "\u2606"}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-bold text-[var(--text-secondary)]">
                      T{a.runner.trap}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      <div>{a.runner.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {a.runner.bookmakerSource}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <OddsCell
                        value={a.runner.bookmakerOdds}
                        highlight={
                          a.edgeVsMidpoint != null && a.edgeVsMidpoint >= 15
                            ? "positive"
                            : undefined
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <OddsCell value={a.runner.betfairBackOdds} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <OddsCell value={a.runner.betfairLayOdds} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <OddsCell value={a.betfairMidpoint} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EdgeCell value={a.edgeVsMidpoint} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MovementCell value={a.movement1m} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MovementCell value={a.movement3m} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MovementCell value={a.movement5m} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MovementCell value={a.movement10m} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ConfidenceBadge confidence={a.confidence} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SignalBadge signal={a.signal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRaceTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutesToOff(iso: string): string {
  const mins = (new Date(iso).getTime() - Date.now()) / 60000;
  if (mins < 0) return "OFF";
  if (mins < 1) return "<1m";
  return `${Math.round(mins)}m to off`;
}
