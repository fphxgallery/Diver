import { getAll } from "./key-store";
import { getUserPositions } from "@/lib/meteora/positions";
import { computePositionHealth, shouldAutoRebalance } from "@/lib/meteora/monitor";
import { executeRebalanceWithKeypair } from "@/lib/meteora/rebalance-server";
import { signAndSendTransactionWithKeypair } from "@/lib/solana/send";
import { addLog } from "./server-log";
import type { PositionHealth, RebalanceRecord } from "@/lib/meteora/monitor";

export interface ServerMonitorState {
  health: PositionHealth[];
  history: RebalanceRecord[];
  running: boolean;
  lastRunAt: number | null;
  error: string | null;
}

// Pin to globalThis — Next.js per-route bundling can otherwise duplicate
// this module so route handlers see a fresh state object while the
// instrumentation runtime mutates a different one.
const REBALANCE_SKIP_COOLDOWN_MS = 30 * 60 * 1000; // 30 min

const g = globalThis as unknown as {
  __diverMonitorState?: ServerMonitorState;
  __diverMonitorTimer?: NodeJS.Timeout | null;
  __diverRebalanceSkipUntil?: Record<string, number>;
};
g.__diverMonitorState ??= {
  health: [],
  history: [],
  running: false,
  lastRunAt: null,
  error: null,
};
g.__diverRebalanceSkipUntil ??= {};
const state: ServerMonitorState = g.__diverMonitorState;
const skipUntil: Record<string, number> = g.__diverRebalanceSkipUntil;

const MAX_HISTORY = 50;

function getIntervalMs(): number {
  const entries = getAll();
  if (entries.length === 0) return 60_000;
  const min = Math.min(...entries.map(e => e.settings.intervalSeconds));
  // Clamp between 60s and 15min — don't let settings push below 60s
  return Math.max(60_000, Math.min(min * 1000, 900_000));
}

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

  addLog("info", "monitor.check.start", `Check started — ${entries.length} wallet(s)`, { wallets: entries.length });

  try {
    for (const entry of entries) {
      if (entry.poolAddresses.length === 0) continue;

      await Promise.allSettled(
        entry.poolAddresses.map(async (poolAddr) => {
          try {
            const { userPositions, activeBinId, activeBinPricePerToken, tokenXDecimals, tokenYDecimals } = await getUserPositions(poolAddr, entry.publicKey, "mainnet-beta", entry.rpcUrl);
            addLog("info", "monitor.pool.check", `${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)} — ${userPositions.length} position(s)`, { pool: poolAddr, positions: userPositions.length });
            for (const pos of userPositions) {
              const h = computePositionHealth(pos, activeBinId, entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8), {
                pricePerToken: activeBinPricePerToken,
                tokenXDecimals,
                tokenYDecimals,
              });
              newHealth.push(h);

              const reason = shouldAutoRebalance(h, entry.settings);
              if (!reason) continue;

              const skipTs = skipUntil[pos.publicKey];
              if (skipTs && Date.now() < skipTs) {
                const minsLeft = Math.ceil((skipTs - Date.now()) / 60_000);
                addLog("info", "rebalance.skip", `Rebalance skipped (cooling down ${minsLeft}m) — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)}`, { pool: poolAddr, position: pos.publicKey.slice(0, 8) });
                continue;
              }

              addLog("warn", "rebalance.trigger", `Rebalance triggered — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)} (${reason}) rpc=${entry.rpcUrl?.slice(0, 40)}`, { pool: poolAddr, reason, position: pos.publicKey.slice(0, 8) });

              let txSigs: string[] = [];
              let success = false;
              let error: string | undefined;

              try {
                const txBase64s = await executeRebalanceWithKeypair({
                  poolAddress: poolAddr,
                  positionKey: pos.publicKey,
                  keypair: entry.keypair,
                  rpcUrl: entry.rpcUrl,
                  settings: {
                    strategyType: entry.settings.defaultStrategyType,
                    numBins: entry.settings.defaultNumBins,
                  },
                });
                for (const tx of txBase64s) {
                  const sig = await signAndSendTransactionWithKeypair(tx, entry.keypair, "mainnet-beta", entry.rpcUrl);
                  txSigs.push(sig);
                }
                success = true;
                h.autoRebalanceTriggered = true;
                addLog("info", "rebalance.success", `Rebalance succeeded — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)} (${txSigs.length} tx)`, { txs: txSigs.length, pool: poolAddr });
              } catch (e) {
                error = e instanceof Error ? e.message : "Rebalance failed";
                const isSkip = error.toLowerCase().includes("skipped") || error.toLowerCase().includes("assertion failed");
                if (isSkip) {
                  skipUntil[pos.publicKey] = Date.now() + REBALANCE_SKIP_COOLDOWN_MS;
                  addLog("warn", "rebalance.skip", `Rebalance skipped — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)}: ${error} (cooling down 30m)`, { pool: poolAddr });
                } else {
                  addLog("error", "rebalance.error", `Rebalance failed — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)}: ${error}`, { pool: poolAddr });
                }
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
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[diver] runCheck failed for pool ${poolAddr}:`, msg);
            addLog("error", "monitor.pool.error", `Pool check failed — ${poolAddr.slice(0, 8)}: ${msg}`, { pool: poolAddr });
          }
        })
      );
    }

    state.health = newHealth;
    state.lastRunAt = Date.now();
    addLog("info", "monitor.check.complete", `Check complete — ${newHealth.length} position(s)`, { positions: newHealth.length });
  } catch (e) {
    state.error = e instanceof Error ? e.message : "Monitor check failed";
    addLog("error", "monitor.check.error", `Check failed: ${state.error}`);
  } finally {
    state.running = false;
  }
}

function scheduleNext() {
  const ms = getIntervalMs();
  g.__diverMonitorTimer = setTimeout(async () => {
    try {
      const entries = getAll();
      if (entries.length > 0) {
        addLog("info", "monitor.scheduled.fire", `Scheduled tick — ${entries.length} wallet(s)`, { wallets: entries.length });
        await runCheck();
      } else {
        addLog("info", "monitor.scheduled.skip", "Scheduled tick — no unlocked wallets, skipping");
      }
    } catch (e) {
      console.error("[diver] scheduleNext error:", e);
      addLog("error", "monitor.scheduled.error", e instanceof Error ? e.message : String(e));
    } finally {
      scheduleNext();
    }
  }, ms);
  if (g.__diverMonitorTimer.unref) g.__diverMonitorTimer.unref();
  addLog("info", "monitor.scheduled.arm", `Next check in ${Math.round(ms / 1000)}s`, { intervalMs: ms });
}

export function startServerMonitor() {
  if (g.__diverMonitorTimer) return;
  addLog("info", "monitor.start", "Server monitor started");
  runCheck();
  scheduleNext();
  console.log("[diver] Server monitor started");
}

export function stopServerMonitor() {
  if (g.__diverMonitorTimer) {
    clearTimeout(g.__diverMonitorTimer);
    g.__diverMonitorTimer = null;
  }
}

export async function triggerCheckNow() {
  await runCheck();
}
