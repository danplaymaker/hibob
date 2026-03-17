"use client";

import { Signal } from "@/lib/types";

const SIGNAL_CONFIG: Record<
  Signal,
  { label: string; bg: string; text: string; border: string }
> = {
  "strong-value": {
    label: "Strong Value",
    bg: "bg-[var(--green-dim)]",
    text: "text-[var(--green)]",
    border: "border-[var(--green)]",
  },
  watch: {
    label: "Watch",
    bg: "bg-[var(--amber-dim)]",
    text: "text-[var(--amber)]",
    border: "border-[var(--amber)]",
  },
  "no-edge": {
    label: "No Edge",
    bg: "bg-[var(--bg-tertiary)]",
    text: "text-[var(--text-muted)]",
    border: "border-[var(--border)]",
  },
  drifting: {
    label: "Drifting",
    bg: "bg-[var(--red-dim)]",
    text: "text-[var(--red)]",
    border: "border-[var(--red)]",
  },
  "low-liquidity": {
    label: "Low Liquidity",
    bg: "bg-[var(--bg-tertiary)]",
    text: "text-[var(--text-muted)]",
    border: "border-[var(--border)]",
  },
};

export function SignalBadge({ signal }: { signal: Signal }) {
  const config = SIGNAL_CONFIG[signal];
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.label}
    </span>
  );
}
