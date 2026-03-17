"use client";

import { useState, useCallback } from "react";
import { useMarketData } from "@/hooks/useMarketData";
import { useAlerts } from "@/hooks/useAlerts";
import { RaceTable } from "@/components/RaceTable";
import { OpportunityList } from "@/components/OpportunityList";
import { RunnerDetail } from "@/components/RunnerDetail";
import { AlertPanel } from "@/components/AlertPanel";
import { FilterBar, Filters } from "@/components/FilterBar";
import { AlertRule, RunnerAnalysis } from "@/lib/types";

type View = "dashboard" | "opportunities" | "alerts";

export default function Home() {
  // View state
  const [view, setView] = useState<View>("dashboard");
  const [selectedRunner, setSelectedRunner] = useState<{
    raceId: string;
    runnerId: string;
  } | null>(null);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    minEdge: 0,
    minLiquidity: 0,
    maxMinutes: 60,
  });

  // Watchlist (persisted in-memory for MVP; localStorage in Phase 2)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Alert rules
  const [alertRules, setAlertRules] = useState<AlertRule[]>([
    {
      id: "default-1",
      enabled: true,
      name: "Strong Edge + Shortening",
      minEdgePercent: 15,
      minShorteningPercent: 5,
      shorteningWindowMinutes: 5,
      requireBoth: true,
    },
  ]);

  // Data fetching
  const dashboardMode = view === "opportunities" ? "opportunities" : "dashboard";
  const { data, loading, error, lastUpdated } = useMarketData(
    dashboardMode,
    filters
  );

  // Alerts
  const {
    alerts,
    dismissAlert,
    dismissAll,
    soundEnabled,
    setSoundEnabled,
    requestNotificationPermission,
  } = useAlerts(alertRules);

  const handleToggleWatchlist = useCallback((id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectRunner = useCallback(
    (raceId: string, runnerId: string) => {
      setSelectedRunner({ raceId, runnerId });
    },
    []
  );

  // Derive counts for nav
  const activeAlertCount = alerts.filter((a) => !a.dismissed).length;

  return (
    <div>
      {/* View tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--border)]">
        <TabButton active={view === "dashboard"} onClick={() => setView("dashboard")}>
          Race Monitor
        </TabButton>
        <TabButton
          active={view === "opportunities"}
          onClick={() => setView("opportunities")}
        >
          Opportunities
        </TabButton>
        <TabButton active={view === "alerts"} onClick={() => setView("alerts")}>
          Alerts
          {activeAlertCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--amber-dim)] text-[var(--amber)]">
              {activeAlertCount}
            </span>
          )}
        </TabButton>
      </div>

      {/* Filters (not shown on alerts view) */}
      {view !== "alerts" && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          lastUpdated={lastUpdated}
          total={
            data
              ? "total" in data
                ? (data as { total: number }).total
                : 0
              : 0
          }
        />
      )}

      {/* Loading / error states */}
      {loading && (
        <div className="text-center py-12 text-[var(--text-muted)] text-sm">
          Loading market data...
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-[var(--red)] text-sm">
          Error: {error}
        </div>
      )}

      {/* Dashboard view */}
      {!loading && !error && view === "dashboard" && data && "races" in data && (
        <RaceTable
          races={
            data.races as {
              race: {
                id: string;
                track: string;
                raceTime: string;
                raceNumber: number;
                status: string;
              };
              runners: RunnerAnalysis[];
            }[]
          }
          watchlist={watchlist}
          onToggleWatchlist={handleToggleWatchlist}
          onSelectRunner={handleSelectRunner}
        />
      )}

      {/* Opportunities view */}
      {!loading &&
        !error &&
        view === "opportunities" &&
        data &&
        "opportunities" in data && (
          <OpportunityList
            opportunities={data.opportunities as RunnerAnalysis[]}
            onSelectRunner={handleSelectRunner}
          />
        )}

      {/* Alerts view */}
      {view === "alerts" && (
        <AlertPanel
          alerts={alerts}
          rules={alertRules}
          onDismiss={dismissAlert}
          onDismissAll={dismissAll}
          onUpdateRules={setAlertRules}
          soundEnabled={soundEnabled}
          onToggleSound={setSoundEnabled}
          onRequestNotifications={requestNotificationPermission}
        />
      )}

      {/* Runner detail modal */}
      {selectedRunner && (
        <RunnerDetail
          raceId={selectedRunner.raceId}
          runnerId={selectedRunner.runnerId}
          onClose={() => setSelectedRunner(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-[var(--blue)] text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}
