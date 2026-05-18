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

const state: ServerMonitorState = {
  health: [],
  history: [],
  running: false,
  lastRunAt: null,
  error: null,
};

const MAX_HISTORY = 50;
let pollTimer: NodeJS.Timeout | null = null;

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
                addLog("error", "rebalance.error", `Rebalance failed — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)}: ${error}`, { pool: poolAddr });
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
  pollTimer = setTimeout(async () => {
    const entries = getAll();
    if (entries.length > 0) await runCheck();
    scheduleNext();
  }, getIntervalMs());
  if (pollTimer.unref) pollTimer.unref();
}

export function startServerMonitor() {
  if (pollTimer) return;
  addLog("info", "monitor.start", "Server monitor started");
  runCheck();
  scheduleNext();
  console.log("[diver] Server monitor started");
}

export function stopServerMonitor() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export async function triggerCheckNow() {
  await runCheck();
}
