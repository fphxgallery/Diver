"use client";

import { create } from "zustand";
import { StrategyType } from "@meteora-ag/dlmm";
import {
  DEFAULT_MONITOR_SETTINGS,
  computePositionHealth,
  shouldAutoRebalance,
  type MonitorSettings,
  type PositionHealth,
  type RebalanceRecord,
} from "@/lib/meteora/monitor";
import { getUserPositions } from "@/lib/meteora/positions";
import { executeRebalance } from "@/lib/meteora/rebalance";
import { signAndSendTransaction } from "@/lib/solana/send";
import type { StoredWallet } from "@diver/keypair-store";

const SETTINGS_KEY = "diver:monitor-settings";
const HISTORY_KEY = "diver:rebalance-history";
const LP_API_KEY = "diver:lp-api-key"; // sessionStorage — cleared on browser close
const MAX_HISTORY = 50;

interface MonitorState {
  settings: MonitorSettings;
  health: PositionHealth[];
  history: RebalanceRecord[];
  running: boolean;
  lastRunAt: number | null;
  error: string | null;

  loadSettings: () => void;
  saveSettings: (s: Partial<MonitorSettings>) => void;
  loadHistory: () => void;
  addHistory: (r: RebalanceRecord) => void;

  runCheck: (params: {
    wallets: StoredWallet[];
    activeWallet: StoredWallet;
    poolAddresses: string[];
    pairNames: Record<string, string>;
    getPassword: (walletId: string) => string | null;
  }) => Promise<void>;

  startPolling: (params: {
    wallets: StoredWallet[];
    activeWallet: StoredWallet;
    poolAddresses: string[];
    pairNames: Record<string, string>;
    getPassword: (walletId: string) => string | null;
  }) => (() => void);
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  settings: DEFAULT_MONITOR_SETTINGS,
  health: [],
  history: [],
  running: false,
  lastRunAt: null,
  error: null,

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
    }
  },

  loadHistory: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) set({ history: JSON.parse(raw) });
    } catch {}
  },

  addHistory: (r) => {
    const history = [r, ...get().history].slice(0, MAX_HISTORY);
    set({ history });
    if (typeof window !== "undefined") localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  },

  runCheck: async ({ wallets, activeWallet, poolAddresses, pairNames, getPassword }) => {
    if (get().running) return;
    set({ running: true, error: null });

    const newHealth: PositionHealth[] = [];

    try {
      for (const wallet of wallets) {
        await Promise.allSettled(
          poolAddresses.map(async (poolAddr) => {
            const { userPositions, activeBinId, activeBinPricePerToken, tokenXDecimals, tokenYDecimals } = await getUserPositions(poolAddr, wallet.publicKey);
            for (const pos of userPositions) {
              const h = computePositionHealth(pos, activeBinId, pairNames[poolAddr] ?? poolAddr.slice(0, 8), {
                pricePerToken: activeBinPricePerToken,
                tokenXDecimals,
                tokenYDecimals,
              });
              newHealth.push(h);

              // Auto-rebalance check
              const { settings } = get();
              const reason = shouldAutoRebalance(h, settings);
              if (reason && wallet.publicKey === activeWallet.publicKey) {
                const password = getPassword(wallet.id);
                if (!password) continue;

                let txSigs: string[] = [];
                let success = false;
                let error: string | undefined;

                try {
                  const txBase64s = await executeRebalance({
                    poolAddress: poolAddr,
                    positionKey: pos.publicKey,
                    wallet,
                    password,
                    settings: {
                      strategyType: settings.defaultStrategyType,
                      numBins: settings.defaultNumBins,
                    },
                    cluster: "mainnet-beta",
                  });

                  for (const txBase64 of txBase64s) {
                    const sig = await signAndSendTransaction(txBase64, wallet, password);
                    txSigs.push(sig);
                  }
                  success = true;
                  h.autoRebalanceTriggered = true;
                } catch (e) {
                  error = e instanceof Error ? e.message : "Rebalance failed";
                  success = false;
                }

                get().addHistory({
                  id: `${Date.now()}-${pos.publicKey.slice(0, 8)}`,
                  positionKey: pos.publicKey,
                  poolAddress: poolAddr,
                  pairName: pairNames[poolAddr] ?? poolAddr.slice(0, 8),
                  triggeredAt: Date.now(),
                  reason: reason as "out_of_range" | "edge_proximity" | "manual",
                  txSigs,
                  success,
                  error,
                });
              }
            }
          })
        );
      }

      set({ health: newHealth, lastRunAt: Date.now() });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Monitor check failed" });
    } finally {
      set({ running: false });
    }
  },

  startPolling: (params) => {
    const run = () => get().runCheck(params);
    run();
    const id = setInterval(run, get().settings.intervalSeconds * 1000);
    return () => clearInterval(id);
  },
}));
