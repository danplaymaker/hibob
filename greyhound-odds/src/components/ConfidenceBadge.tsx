"use client";

import { ConfidenceScore } from "@/lib/types";

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceScore }) {
  const color =
    confidence.label === "high"
      ? "text-[var(--green)]"
      : confidence.label === "medium"
        ? "text-[var(--amber)]"
        : "text-[var(--text-muted)]";

  return (
    <span
      className={`${color} tabular-nums text-xs`}
      title={confidence.reasons.join(", ")}
    >
      {confidence.value}
    </span>
  );
}
