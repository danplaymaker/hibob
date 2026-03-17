"use client";

export function EdgeCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const color =
    value >= 15
      ? "text-[var(--green)] font-bold"
      : value >= 8
        ? "text-[var(--amber)] font-semibold"
        : value > 0
          ? "text-[var(--text-secondary)]"
          : "text-[var(--text-muted)]";

  return (
    <span className={`${color} tabular-nums`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
