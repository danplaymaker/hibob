"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RunnerAnalysis } from "@/lib/types";

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

interface DashboardData {
  races: RaceGroup[];
  total: number;
}

interface OpportunityData {
  opportunities: RunnerAnalysis[];
  total: number;
}

interface Filters {
  minEdge: number;
  minLiquidity: number;
  maxMinutes: number;
}

export function useMarketData(
  mode: "dashboard" | "opportunities",
  filters: Filters,
  pollInterval: number = 5000
) {
  const [data, setData] = useState<DashboardData | OpportunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        mode: mode === "opportunities" ? "opportunities" : "all",
        minEdge: filters.minEdge.toString(),
        minLiquidity: filters.minLiquidity.toString(),
        maxMinutes: filters.maxMinutes.toString(),
      });

      const res = await fetch(`/api/races?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [mode, filters.minEdge, filters.minLiquidity, filters.maxMinutes]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, pollInterval]);

  return { data, loading, error, lastUpdated, refresh: fetchData };
}
