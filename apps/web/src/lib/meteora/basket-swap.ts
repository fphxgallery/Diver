import type { Connection, Keypair } from "@solana/web3.js";
import { getWalletHoldings, fetchPrices } from "@/lib/server/portfolio-value";
import { swapWithKeypair } from "@/lib/jupiter/swap-server";
import type { BasketToken } from "./monitor";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_FEE_RESERVE = 0.02; // keep this much native SOL for fees when swapping from SOL

/**
 * Acquire the deficit token by swapping from the reserve basket. Picks the
 * basket token most over its target weight as the swap source, sizes the swap
 * to the shortfall (capped by % of position value), and routes through Jupiter.
 * Returns null when no swap is performed (no funded source, missing prices,
 * shortfall too small, or the swap fails — caller proceeds without it).
 */
export async function acquireDeficitToken(params: {
  connection: Connection;
  keypair: Keypair;
  owner: string;
  rpcUrl: string;
  basket: BasketToken[];
  deficitMint: string;
  deficitDecimals: number;
  shortfallRaw: number;
  positionValueUsd: number;
  maxPriceImpactPct: number;
  maxPctOfPosition: number;
  apiKey: string;
}): Promise<{ signature: string; source: string; outAmount: string } | null> {
  const candidates = params.basket.filter(b => b.mint !== params.deficitMint);
  if (candidates.length === 0) return null;

  const prices = await fetchPrices([params.deficitMint, ...candidates.map(b => b.mint)]);
  const pDef = prices[params.deficitMint];
  if (!pDef) return null; // can't value the swap safely

  const holdings = await getWalletHoldings(params.owner, params.rpcUrl);
  const balByMint = new Map(holdings.map(h => [h.mint, h.amount]));

  type Funded = BasketToken & { price: number; uiBal: number; valueUsd: number };
  const funded: Funded[] = [];
  for (const b of candidates) {
    const price = prices[b.mint];
    if (!price) continue;
    let uiBal = balByMint.get(b.mint) ?? 0;
    if (b.mint === NATIVE_SOL_MINT) uiBal = Math.max(0, uiBal - SOL_FEE_RESERVE);
    if (uiBal <= 0) continue;
    funded.push({ ...b, price, uiBal, valueUsd: uiBal * price });
  }
  if (funded.length === 0) return null;

  // Pick the source most over its target weight, so swapping also restores basket balance.
  const totalBasketVal = funded.reduce((s, f) => s + f.valueUsd, 0);
  let source = funded[0];
  let bestOver = -Infinity;
  for (const f of funded) {
    const targetVal = totalBasketVal * (f.weightPct / 100);
    const over = f.valueUsd - targetVal;
    if (over > bestOver) { bestOver = over; source = f; }
  }

  const shortfallUsd = (params.shortfallRaw / 10 ** params.deficitDecimals) * pDef;
  const capUsd = params.positionValueUsd > 0
    ? params.positionValueUsd * (params.maxPctOfPosition / 100)
    : shortfallUsd;
  const swapUsd = Math.min(shortfallUsd, capUsd, source.valueUsd);
  if (swapUsd < 0.01) return null;

  const inputRaw = Math.floor((swapUsd / source.price) * 10 ** source.decimals);
  if (inputRaw <= 0) return null;

  const slippageBps = Math.max(50, Math.round(params.maxPriceImpactPct * 100));
  try {
    const res = await swapWithKeypair({
      inputMint: source.mint,
      outputMint: params.deficitMint,
      amount: BigInt(inputRaw),
      slippageBps,
      keypair: params.keypair,
      apiKey: params.apiKey,
      maxPriceImpactPct: params.maxPriceImpactPct,
      connection: params.connection,
    });
    return { signature: res.signature, source: source.symbol, outAmount: res.outAmount };
  } catch (e) {
    console.warn(`[diver] basket swap failed (${source.symbol} → deficit), proceeding without:`, e instanceof Error ? e.message : e);
    return null;
  }
}
