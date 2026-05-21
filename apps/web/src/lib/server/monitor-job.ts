import { getAll } from "./key-store";
import { getUserPositions } from "@/lib/meteora/positions";
import { computePositionHealth, shouldAutoRebalance } from "@/lib/meteora/monitor";
import { executeRebalanceWithKeypair } from "@/lib/meteora/rebalance-server";
import { addLog } from "./server-log";
import { getWalletHoldings, fetchPrices, type Holding } from "./portfolio-value";
import { recordValueSnapshot } from "./value-history-store";
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
      const positionContribs: Holding[] = [];

      for (let pi = 0; pi < entry.poolAddresses.length; pi++) {
        if (pi > 0) await new Promise(r => setTimeout(r, 500));
        const poolAddr = entry.poolAddresses[pi];
        await (async () => {
          try {
            const { userPositions, activeBinId, activeBinPricePerToken, tokenXDecimals, tokenYDecimals, tokenXMint, tokenYMint } = await getUserPositions(poolAddr, entry.publicKey, "mainnet-beta", entry.rpcUrl);
            addLog("info", "monitor.pool.check", `${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)} — ${userPositions.length} position(s)`, { pool: poolAddr, positions: userPositions.length });
            for (const pos of userPositions) {
              const xUi = parseFloat(pos.totalXAmount) / Math.pow(10, tokenXDecimals);
              const yUi = parseFloat(pos.totalYAmount) / Math.pow(10, tokenYDecimals);
              if (xUi > 0) positionContribs.push({ mint: tokenXMint, amount: xUi });
              if (yUi > 0) positionContribs.push({ mint: tokenYMint, amount: yUi });

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

              const txSigs: string[] = [];
              let success = false;
              let error: string | undefined;

              try {
                const sigs = await executeRebalanceWithKeypair({
                  poolAddress: poolAddr,
                  positionKey: pos.publicKey,
                  keypair: entry.keypair,
                  rpcUrl: entry.rpcUrl,
                  topUpEnabled: entry.settings.topUpEnabled,
                  basketSwapEnabled: entry.settings.basketSwapEnabled,
                  basket: entry.settings.basket,
                  basketSwapMaxPriceImpactPct: entry.settings.basketSwapMaxPriceImpactPct,
                  basketSwapMaxPctOfPosition: entry.settings.basketSwapMaxPctOfPosition,
                  jupiterApiKey: entry.settings.jupiterApiKey,
                  settings: {
                    strategyType: entry.settings.defaultStrategyType,
                    numBins: entry.settings.defaultNumBins,
                  },
                });
                txSigs.push(...sigs);
                success = true;
                h.autoRebalanceTriggered = true;
                addLog("info", "rebalance.success", `Rebalance succeeded — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)} (${txSigs.length} tx)`, { txs: txSigs.length, pool: poolAddr });
              } catch (e) {
                error = e instanceof Error ? e.message : "Rebalance failed";
                const lower = error.toLowerCase();
                // SPL Token error 1 (InsufficientFunds) surfaces as {"Custom":1} from the deposit CPI —
                // the wallet lacks enough of a token to fund the rebalance. Treat as a skip, not a hard
                // error, so it cools down instead of retrying (and failing) every tick.
                const isInsufficient = error.includes('"Custom":1') || lower.includes("insufficient") || lower.includes("custom program error: 0x1") || lower.includes("wallet lacks tokens") || lower.includes("reserve basket");
                const isSkip = lower.includes("skipped") || lower.includes("assertion failed") || isInsufficient;
                if (isSkip) {
                  // Swap-eligible funding skip: when basket swap is on, DON'T cool down — let the
                  // position retry each tick so the reactive swap path is actually reached. Other
                  // skips (assertion / empty position) still cool down to avoid spamming.
                  const swapEligible = isInsufficient && entry.settings.basketSwapEnabled;
                  if (!swapEligible) skipUntil[pos.publicKey] = Date.now() + REBALANCE_SKIP_COOLDOWN_MS;
                  const hint = isInsufficient && !entry.settings.basketSwapEnabled ? " — wallet lacks tokens to fund the deposit; fund the wallet or enable Reserve Basket Swap" : "";
                  const cool = swapEligible ? "retrying next tick (basket swap on)" : "cooling down 30m";
                  addLog("warn", "rebalance.skip", `Rebalance skipped — ${entry.pairNames[poolAddr] ?? poolAddr.slice(0, 8)}: ${error}${hint} (${cool})`, { pool: poolAddr });
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
        })();
      }

      // Record total portfolio value (wallet tokens + DLMM positions) — throttled to hourly.
      try {
        const holdings = await getWalletHoldings(entry.publicKey, entry.rpcUrl);
        const prices = await fetchPrices([...holdings.map(h => h.mint), ...positionContribs.map(c => c.mint)]);
        const walletUsd = holdings.reduce((s, h) => s + h.amount * (prices[h.mint] ?? 0), 0);
        const positionsUsd = positionContribs.reduce((s, c) => s + c.amount * (prices[c.mint] ?? 0), 0);
        await recordValueSnapshot(entry.publicKey, walletUsd + positionsUsd);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog("warn", "value.snapshot.error", `Value snapshot failed — ${entry.publicKey.slice(0, 8)}: ${msg}`, { wallet: entry.publicKey.slice(0, 8) });
      }
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
