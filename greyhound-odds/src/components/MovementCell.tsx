"use client";

/**
 * Displays a price movement percentage with colour coding.
 * Negative (shortening) = green, Positive (drifting) = red.
 */
export function MovementCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const isShortening = value < 0;
  const isDrifting = value > 1;
  const color = isShortening
    ? "text-[var(--green)]"
    : isDrifting
      ? "text-[var(--red)]"
      : "text-[var(--text-secondary)]";

  return (
    <span className={`${color} tabular-nums`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
