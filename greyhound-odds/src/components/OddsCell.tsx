"use client";

export function OddsCell({
  value,
  highlight,
}: {
  value: number | null;
  highlight?: "positive" | "negative" | "neutral";
}) {
  if (value == null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const color =
    highlight === "positive"
      ? "text-[var(--green)]"
      : highlight === "negative"
        ? "text-[var(--red)]"
        : "text-[var(--text-primary)]";

  return <span className={`${color} tabular-nums font-medium`}>{value.toFixed(2)}</span>;
}
