"use client";

import { create } from "zustand";
import { StrategyType } from "@meteora-ag/dlmm";
import {
  DEFAULT_MONITOR_SETTINGS,
  type MonitorSettings,
} from "@/lib/meteora/monitor";

const SETTINGS_KEY = "diver:monitor-settings";
const LP_API_KEY = "diver:lp-api-key"; // sessionStorage — cleared on browser close

interface MonitorState {
  settings: MonitorSettings;
  loadSettings: () => void;
  saveSettings: (s: Partial<MonitorSettings>) => void;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  settings: DEFAULT_MONITOR_SETTINGS,

  loadSettings: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const base = raw ? { ...DEFAULT_MONITOR_SETTINGS, ...JSON.parse(raw) } : DEFAULT_MONITOR_SETTINGS;
      const lpAgentApiKey = sessionStorage.getItem(LP_API_KEY) ?? "";
      set({ settings: { ...base, lpAgentApiKey } });
    } catch {}
  },

  saveSettings: (s) => {
    const next = { ...get().settings, ...s };
    set({ settings: next });
    if (typeof window !== "undefined") {
      if ("lpAgentApiKey" in s) sessionStorage.setItem(LP_API_KEY, next.lpAgentApiKey);
      const { lpAgentApiKey: _, ...rest } = next;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
      // Push to server for all unlocked wallets (fire-and-forget)
      fetch("/api/monitor")
        .then(r => r.ok ? r.json() : null)
        .then((status: { unlocked?: Array<{ walletId: string }> } | null) => {
          if (!status?.unlocked?.length) return;
          for (const { walletId } of status.unlocked) {
            fetch("/api/monitor", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "update_settings", walletId, settings: next }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  },
}));
