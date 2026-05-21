// Per-position fee tracking. Called from monitor-job each tick.
// Detects claim events (unclaimed fee balance drops), accumulates totals.
// USD conversion uses prices provided at tick time — cached so the API
// can read without an extra price fetch.

interface PositionEntry {
  tokenXMint: string;
  tokenYMint: string;
  decimalsX: number;
  decimalsY: number;
  lastFeeXRaw: bigint;
  lastFeeYRaw: bigint;
  claimedXTotal: bigint;
  claimedYTotal: bigint;
}

interface WalletTracker {
  positions: Map<string, PositionEntry>;
  rebalanceCostLamports: number;
  cachedUnclaimedUsd: number;
  cachedClaimedUsd: number;
  cachedRebalanceCostUsd: number;
}

export interface FeeSummary {
  unclaimedUsd: number;
  claimedUsd: number;
  totalEarnedUsd: number;
  rebalanceCostUsd: number;
  netUsd: number;
}

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

const g = globalThis as unknown as { __diverFeeTracker?: Map<string, WalletTracker> };
g.__diverFeeTracker ??= new Map();
const tracker: Map<string, WalletTracker> = g.__diverFeeTracker;

function ensureWallet(publicKey: string): WalletTracker {
  if (!tracker.has(publicKey)) {
    tracker.set(publicKey, {
      positions: new Map(),
      rebalanceCostLamports: 0,
      cachedUnclaimedUsd: 0,
      cachedClaimedUsd: 0,
      cachedRebalanceCostUsd: 0,
    });
  }
  return tracker.get(publicKey)!;
}

/** Called each monitor tick for every position. Detects claim events from fee drops. */
export function recordFeeTick(
  walletPublicKey: string,
  positionKey: string,
  feeXRaw: string,
  feeYRaw: string,
  tokenXMint: string,
  tokenYMint: string,
  decimalsX: number,
  decimalsY: number,
): void {
  const wallet = ensureWallet(walletPublicKey);
  const feeX = BigInt(feeXRaw || "0");
  const feeY = BigInt(feeYRaw || "0");

  const prev = wallet.positions.get(positionKey);
  if (!prev) {
    wallet.positions.set(positionKey, {
      tokenXMint, tokenYMint, decimalsX, decimalsY,
      lastFeeXRaw: feeX,
      lastFeeYRaw: feeY,
      claimedXTotal: BigInt(0),
      claimedYTotal: BigInt(0),
    });
    return;
  }

  // Drop in unclaimed balance = fees were claimed between ticks
  const droppedX = prev.lastFeeXRaw > feeX ? prev.lastFeeXRaw - feeX : BigInt(0);
  const droppedY = prev.lastFeeYRaw > feeY ? prev.lastFeeYRaw - feeY : BigInt(0);

  wallet.positions.set(positionKey, {
    ...prev,
    tokenXMint, tokenYMint, decimalsX, decimalsY,
    lastFeeXRaw: feeX,
    lastFeeYRaw: feeY,
    claimedXTotal: prev.claimedXTotal + droppedX,
    claimedYTotal: prev.claimedYTotal + droppedY,
  });
}

/** Add on-chain tx fees paid for a rebalance (lamports). */
export function addRebalanceCost(walletPublicKey: string, lamports: number): void {
  ensureWallet(walletPublicKey).rebalanceCostLamports += lamports;
}

/**
 * Recompute and cache USD values. Call at end of each monitor tick after
 * fetching prices. prices keyed by mint address; solPriceUsd for lamport→USD.
 */
export function updateFeeUsd(
  walletPublicKey: string,
  prices: Record<string, number>,
): void {
  const wallet = tracker.get(walletPublicKey);
  if (!wallet) return;

  const solPriceUsd = prices[NATIVE_SOL_MINT] ?? 0;

  let unclaimedUsd = 0;
  let claimedUsd = 0;
  for (const pos of wallet.positions.values()) {
    const px = prices[pos.tokenXMint] ?? 0;
    const py = prices[pos.tokenYMint] ?? 0;
    unclaimedUsd += (Number(pos.lastFeeXRaw) / 10 ** pos.decimalsX) * px
                  + (Number(pos.lastFeeYRaw) / 10 ** pos.decimalsY) * py;
    claimedUsd   += (Number(pos.claimedXTotal) / 10 ** pos.decimalsX) * px
                  + (Number(pos.claimedYTotal) / 10 ** pos.decimalsY) * py;
  }

  wallet.cachedUnclaimedUsd = unclaimedUsd;
  wallet.cachedClaimedUsd = claimedUsd;
  wallet.cachedRebalanceCostUsd = wallet.rebalanceCostLamports * 1e-9 * solPriceUsd;
}

/** Returns cached summary (no I/O). Updated by updateFeeUsd each monitor tick. */
export function getFeeSummary(walletPublicKey: string): FeeSummary {
  const wallet = tracker.get(walletPublicKey);
  if (!wallet) return { unclaimedUsd: 0, claimedUsd: 0, totalEarnedUsd: 0, rebalanceCostUsd: 0, netUsd: 0 };
  const total = wallet.cachedUnclaimedUsd + wallet.cachedClaimedUsd;
  return {
    unclaimedUsd: wallet.cachedUnclaimedUsd,
    claimedUsd: wallet.cachedClaimedUsd,
    totalEarnedUsd: total,
    rebalanceCostUsd: wallet.cachedRebalanceCostUsd,
    netUsd: total - wallet.cachedRebalanceCostUsd,
  };
}
