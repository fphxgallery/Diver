import { getAll } from "./key-store";
import { getUserPositions } from "@/lib/meteora/positions";
import { computePositionHealth, shouldAutoRebalance } from "@/lib/meteora/monitor";
import { executeRebalanceWithKeypair } from "@/lib/meteora/rebalance-server";
import { signAndSendTransactionWithKeypair } from "@/lib/solana/send";
import type { PositionHealth, RebalanceRecord } from "@/lib/meteora/monitor";

export interface ServerMonitorState {
  health: PositionHealth[];
  history: RebalanceRecord[];
  running: boolean;
  lastRunAt: number | null;
  error: string | null;
}

const state: ServerMonitorState = {
  health: [],
  history: [],
  running: false,
  lastRunAt: null,
  error: null,
};

const MAX_HISTORY = 50;
let pollTimer: NodeJS.Timeout | null = null;

export function getState(): ServerMonitorState {
  return { ...state, health: [...state.health], history: [...state.history] };
}

async function runCheck() {
  if (state.running) return;
  const entries = getAll();
  if (entries.length === 0) return;

  state.running = true;
  state.error = null;
  const newHealth: PositionHealth[] = [];

  try {
    for (const entry of entries) {
      if (entry.poolAddresses.length === 0) continue;

      await Promise.allSettled(
        entry.poolAddresses.map(async (poolAddr) => {
          try {
            const { userPositions, activeBinId, activeBinPricePerToken, tokenXDecimals, tokenYDecimals } = await getUserPositions(poolAddr, entry.publicKey);
            for (const pos of userPositions) {
              const h = computePositionHealth(pos, activeBinId, entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8), {
                pricePerToken: activeBinPricePerToken,
                tokenXDecimals,
                tokenYDecimals,
              });
              newHealth.push(h);

              if (!entry.settings.enabled) continue;
              const reason = shouldAutoRebalance(h, entry.settings);
              if (!reason) continue;

              let txSigs: string[] = [];
              let success = false;
              let error: string | undefined;

              try {
                const txBase64s = await executeRebalanceWithKeypair({
                  poolAddress: poolAddr,
                  positionKey: pos.publicKey,
                  keypair: entry.keypair,
                  settings: {
                    strategyType: entry.settings.defaultStrategyType,
                    numBins: entry.settings.defaultNumBins,
                  },
                });
                for (const tx of txBase64s) {
                  const sig = await signAndSendTransactionWithKeypair(tx, entry.keypair);
                  txSigs.push(sig);
                }
                success = true;
                h.autoRebalanceTriggered = true;
              } catch (e) {
                error = e instanceof Error ? e.message : "Rebalance failed";
              }

              const record: RebalanceRecord = {
                id: `${Date.now()}-${pos.publicKey.slice(0, 8)}`,
                positionKey: pos.publicKey,
                poolAddress: poolAddr,
                pairName: entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8),
                triggeredAt: Date.now(),
                reason: reason as "out_of_range" | "edge_proximity" | "manual",
                txSigs,
                success,
                error,
              };
              state.history = [record, ...state.history].slice(0, MAX_HISTORY);
            }
          } catch {
            // Per-pool errors don't abort the whole check
          }
        })
      );
    }

    state.health = newHealth;
    state.lastRunAt = Date.now();
  } catch (e) {
    state.error = e instanceof Error ? e.message : "Monitor check failed";
  } finally {
    state.running = false;
  }
}

export function startServerMonitor() {
  if (pollTimer) return;
  // Run immediately, then schedule based on shortest interval among unlocked wallets
  runCheck();
  pollTimer = setInterval(() => {
    const entries = getAll();
    if (entries.length === 0) return;
    runCheck();
  }, 30_000); // Check every 30s; actual rebalance gated by per-wallet settings
  if (pollTimer.unref) pollTimer.unref();
  console.log("[diver] Server monitor started");
}

export function stopServerMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function triggerCheckNow() {
  await runCheck();
}
