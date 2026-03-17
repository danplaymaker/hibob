"use client";

import { useState } from "react";
import { Alert, AlertRule } from "@/lib/types";

export function AlertPanel({
  alerts,
  rules,
  onDismiss,
  onDismissAll,
  onUpdateRules,
  soundEnabled,
  onToggleSound,
  onRequestNotifications,
}: {
  alerts: Alert[];
  rules: AlertRule[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onUpdateRules: (rules: AlertRule[]) => void;
  soundEnabled: boolean;
  onToggleSound: (v: boolean) => void;
  onRequestNotifications: () => void;
}) {
  const [showAddRule, setShowAddRule] = useState(false);
  const activeAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <div className="space-y-4">
      {/* Alert rules */}
      <div className="border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Alert Rules
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onToggleSound(!soundEnabled)}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              Sound: {soundEnabled ? "ON" : "OFF"}
            </button>
            <button
              onClick={onRequestNotifications}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              Enable Notifications
            </button>
            <button
              onClick={() => setShowAddRule(!showAddRule)}
              className="text-[10px] px-2 py-1 border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              + Add Rule
            </button>
          </div>
        </div>

        {showAddRule && (
          <AddRuleForm
            onAdd={(rule) => {
              onUpdateRules([...rules, rule]);
              setShowAddRule(false);
            }}
            onCancel={() => setShowAddRule(false)}
          />
        )}

        {rules.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            No alert rules configured. Add a rule to get notified of opportunities.
          </p>
        )}

        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  onUpdateRules(
                    rules.map((r) =>
                      r.id === rule.id ? { ...r, enabled: !r.enabled } : r
                    )
                  )
                }
                className={`w-8 h-4 rounded-full relative transition-colors ${
                  rule.enabled
                    ? "bg-[var(--green-dim)]"
                    : "bg-[var(--bg-tertiary)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                    rule.enabled
                      ? "left-4 bg-[var(--green)]"
                      : "left-0.5 bg-[var(--text-muted)]"
                  }`}
                />
              </button>
              <div>
                <div className="text-xs text-[var(--text-primary)]">{rule.name}</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {describeRule(rule)}
                </div>
              </div>
            </div>
            <button
              onClick={() => onUpdateRules(rules.filter((r) => r.id !== rule.id))}
              className="text-[var(--text-muted)] hover:text-[var(--red)] text-xs"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Active alerts */}
      <div className="border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Alerts ({activeAlerts.length})
          </h3>
          {activeAlerts.length > 0 && (
            <button
              onClick={onDismissAll}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              Dismiss All
            </button>
          )}
        </div>

        {activeAlerts.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">No active alerts.</p>
        )}

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start justify-between p-2 rounded border border-[var(--amber-dim)] bg-[var(--amber-dim)]/20"
            >
              <div>
                <div className="text-xs text-[var(--text-primary)]">{alert.message}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {new Date(alert.timestamp).toLocaleTimeString("en-GB")}
                </div>
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs shrink-0 ml-2"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function describeRule(rule: AlertRule): string {
  const parts: string[] = [];
  if (rule.minEdgePercent != null) {
    parts.push(`Edge >= ${rule.minEdgePercent}%`);
  }
  if (rule.minShorteningPercent != null) {
    parts.push(
      `Shortening >= ${rule.minShorteningPercent}% in ${rule.shorteningWindowMinutes ?? 5}m`
    );
  }
  if (rule.requireBoth && parts.length > 1) {
    return parts.join(" AND ");
  }
  return parts.join(" OR ") || "No conditions set";
}

function AddRuleForm({
  onAdd,
  onCancel,
}: {
  onAdd: (rule: AlertRule) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [minEdge, setMinEdge] = useState("15");
  const [minShortening, setMinShortening] = useState("5");
  const [window, setWindow] = useState("5");
  const [requireBoth, setRequireBoth] = useState(true);

  return (
    <div className="mb-4 p-3 rounded border border-[var(--border)] bg-[var(--bg-tertiary)]">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] text-[var(--text-muted)] block mb-1">
            Rule Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
            placeholder="e.g. Strong edge alert"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-muted)] block mb-1">
            Min Edge %
          </label>
          <input
            type="number"
            value={minEdge}
            onChange={(e) => setMinEdge(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-muted)] block mb-1">
            Min Shortening %
          </label>
          <input
            type="number"
            value={minShortening}
            onChange={(e) => setMinShortening(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-muted)] block mb-1">
            Window (minutes)
          </label>
          <input
            type="number"
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={requireBoth}
            onChange={(e) => setRequireBoth(e.target.checked)}
            className="accent-[var(--green)]"
          />
          Require both conditions
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onAdd({
              id: `rule-${Date.now()}`,
              enabled: true,
              name: name || "Unnamed Rule",
              minEdgePercent: parseFloat(minEdge) || null,
              minShorteningPercent: parseFloat(minShortening) || null,
              shorteningWindowMinutes: parseFloat(window) || 5,
              requireBoth,
            })
          }
          className="px-3 py-1 text-xs bg-[var(--green-dim)] text-[var(--green)] border border-[var(--green)] rounded hover:bg-[var(--green)]/20"
        >
          Add Rule
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-[var(--text-muted)] border border-[var(--border)] rounded hover:text-[var(--text-secondary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
