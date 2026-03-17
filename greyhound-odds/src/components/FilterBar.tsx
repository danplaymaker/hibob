"use client";

export interface Filters {
  minEdge: number;
  minLiquidity: number;
  maxMinutes: number;
}

export function FilterBar({
  filters,
  onChange,
  lastUpdated,
  total,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  lastUpdated: Date | null;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-3 px-1 text-xs">
      <div className="flex items-center gap-2">
        <label className="text-[var(--text-muted)]">Min Edge %</label>
        <input
          type="number"
          value={filters.minEdge}
          onChange={(e) =>
            onChange({ ...filters, minEdge: parseFloat(e.target.value) || 0 })
          }
          className="w-16 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] tabular-nums"
          min={0}
          step={1}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[var(--text-muted)]">Min Liquidity £</label>
        <input
          type="number"
          value={filters.minLiquidity}
          onChange={(e) =>
            onChange({
              ...filters,
              minLiquidity: parseFloat(e.target.value) || 0,
            })
          }
          className="w-20 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] tabular-nums"
          min={0}
          step={50}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[var(--text-muted)]">Max mins to off</label>
        <input
          type="number"
          value={filters.maxMinutes}
          onChange={(e) =>
            onChange({
              ...filters,
              maxMinutes: parseFloat(e.target.value) || 120,
            })
          }
          className="w-16 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] tabular-nums"
          min={1}
          step={5}
        />
      </div>

      <div className="ml-auto flex items-center gap-3 text-[var(--text-muted)]">
        <span>{total} runners</span>
        {lastUpdated && (
          <span>
            Updated{" "}
            {lastUpdated.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
