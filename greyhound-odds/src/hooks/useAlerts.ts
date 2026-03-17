"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, AlertRule } from "@/lib/types";

export function useAlerts(rules: AlertRule[], pollInterval: number = 10000) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const checkAlerts = useCallback(async () => {
    if (rules.length === 0) return;

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const newAlerts: Alert[] = json.alerts ?? [];

      if (newAlerts.length > 0) {
        setAlerts((prev) => {
          // Dedupe by runner+rule combo
          const existingKeys = new Set(
            prev.map((a) => `${a.ruleId}-${a.runnerId}`)
          );
          const truly = newAlerts.filter(
            (a) => !existingKeys.has(`${a.ruleId}-${a.runnerId}`)
          );
          if (truly.length === 0) return prev;

          // Play sound
          if (soundEnabled && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }

          // Browser notification
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            for (const a of truly) {
              new Notification("Greyhound Odds Alert", { body: a.message });
            }
          }

          return [...truly, ...prev].slice(0, 100); // keep last 100
        });
      }
    } catch {
      // Silently fail on alert checks
    }
  }, [rules, soundEnabled]);

  useEffect(() => {
    checkAlerts();
    const id = setInterval(checkAlerts, pollInterval);
    return () => clearInterval(id);
  }, [checkAlerts, pollInterval]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a))
    );
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })));
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification !== "undefined") {
      await Notification.requestPermission();
    }
  }, []);

  return {
    alerts,
    dismissAlert,
    dismissAll,
    soundEnabled,
    setSoundEnabled,
    audioRef,
    requestNotificationPermission,
  };
}
