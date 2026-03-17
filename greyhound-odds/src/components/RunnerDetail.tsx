"use client";

import { useState, useEffect } from "react";
import { RunnerAnalysis, PriceSnapshot } from "@/lib/types";
import { SignalBadge } from "./SignalBadge";
import { EdgeCell } from "./EdgeCell";
import { MovementCell } from "./MovementCell";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { PriceChart } from "./PriceChart";

interface RunnerDetailData extends RunnerAnalysis {
  explanation: string;
}

export function RunnerDetail({
  raceId,
  runnerId,
  onClose,
}: {
  raceId: string;
  runnerId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<RunnerDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/races/${raceId}`);
        if (!res.ok) return;
        const json = await res.json();
        const runner = json.runners?.find(
          (r: RunnerDetailData) => r.runner.id === runnerId
        );
        if (runner) setData(runner);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [raceId, runnerId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6">
          <p className="text-[var(--text-muted)]">Runner not found.</p>
          <button onClick={onClose} className="mt-4 text-xs text-[var(--blue)]">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto mt-8 mb-8">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">{data.runner.name}</h2>
                <span className="text-xs text-[var(--text-muted)]">
                  T{data.runner.trap}
                </span>
                <SignalBadge signal={data.signal} />
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                {data.race.track} R{data.race.raceNumber} &middot;{" "}
                {new Date(data.race.raceTime).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                &middot; {data.runner.bookmakerSource}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg"
            >
              &times;
            </button>
          </div>

          {/* Key metrics grid */}
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 border-b border-[var(--border)]">
            <MetricCard label="Bookie" value={data.runner.bookmakerOdds?.toFixed(2) ?? "—"} />
            <MetricCard label="BF Back" value={data.runner.betfairBackOdds?.toFixed(2) ?? "—"} />
            <MetricCard label="BF Lay" value={data.runner.betfairLayOdds?.toFixed(2) ?? "—"} />
            <MetricCard label="BF Midpoint" value={data.betfairMidpoint?.toFixed(2) ?? "—"} />
            <MetricCard label="Edge vs Mid">
              <EdgeCell value={data.edgeVsMidpoint} />
            </MetricCard>
            <MetricCard label="Edge vs Lay">
              <EdgeCell value={data.edgeVsLay} />
            </MetricCard>
            <MetricCard label="Confidence">
              <ConfidenceBadge confidence={data.confidence} />
            </MetricCard>
          </div>

          {/* Movement row */}
          <div className="px-6 py-3 flex items-center gap-6 border-b border-[var(--border)] text-xs">
            <span className="text-[var(--text-muted)]">BF Movement:</span>
            <span>
              1m: <MovementCell value={data.movement1m} />
            </span>
            <span>
              3m: <MovementCell value={data.movement3m} />
            </span>
            <span>
              5m: <MovementCell value={data.movement5m} />
            </span>
            <span>
              10m: <MovementCell value={data.movement10m} />
            </span>
          </div>

          {/* Chart */}
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              Price History
            </h3>
            <PriceChart history={data.runner.priceHistory} />
          </div>

          {/* Signal explanation */}
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
              Analysis
            </h3>
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
              {data.explanation}
            </p>
          </div>

          {/* Confidence breakdown */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
              Confidence Factors
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.confidence.reasons.map((reason, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)]"
                >
                  {reason}
                </span>
              ))}
            </div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Volume: £{data.runner.betfairMatchedVolume.toLocaleString()} matched
              &middot; Market: £{Math.round(data.runner.betfairTotalMatched).toLocaleString()} total
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {label}
      </div>
      {children ?? (
        <div className="text-sm font-medium tabular-nums">{value}</div>
      )}
    </div>
  );
}
