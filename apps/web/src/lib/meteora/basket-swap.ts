import type { Connection, Keypair } from "@solana/web3.js";
import { getWalletHoldings, fetchPrices } from "@/lib/server/portfolio-value";
import { addLog } from "@/lib/server/server-log";
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
  const deficit = params.deficitMint.slice(0, 8);
  const skip = (reason: string) => addLog("warn", "rebalance.swap.skip", `Basket swap not done (deficit ${deficit}…): ${reason}`, { deficit });

  const candidates = params.basket.filter(b => b.mint !== params.deficitMint);
  if (candidates.length === 0) { skip("basket has no tokens besides the deficit token"); return null; }

  const prices = await fetchPrices([params.deficitMint, ...candidates.map(b => b.mint)]);
  const pDef = prices[params.deficitMint];
  if (!pDef) { skip("no USD price for deficit token (can't size swap)"); return null; }

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
  if (funded.length === 0) { skip("wallet holds none of the basket reserve tokens (free balance ~0 — funds likely locked in positions)"); return null; }

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
  if (swapUsd < 0.01) { skip(`computed swap size $${swapUsd.toFixed(4)} too small (shortfall $${shortfallUsd.toFixed(2)}, source ${source.symbol} $${source.valueUsd.toFixed(2)}, cap $${capUsd.toFixed(2)})`); return null; }

  const inputRaw = Math.floor((swapUsd / source.price) * 10 ** source.decimals);
  if (inputRaw <= 0) { skip("input amount rounds to 0"); return null; }

  addLog("info", "rebalance.swap.try", `Basket swap ${source.symbol} → deficit ${deficit}… ($${swapUsd.toFixed(2)})`, { source: source.symbol, deficit, usd: Number(swapUsd.toFixed(2)) });

  // Market floor: fair deficit out at mid price, minus the allowed impact. Guards the fill
  // without relying on Jupiter's unreliable priceImpact field.
  const fairOutUi = swapUsd / pDef;
  const minOutRaw = BigInt(Math.floor(fairOutUi * (1 - params.maxPriceImpactPct / 100) * 10 ** params.deficitDecimals));

  try {
    // No slippageBps → Ultra mode (all routers + RFQ).
    const res = await swapWithKeypair({
      inputMint: source.mint,
      outputMint: params.deficitMint,
      amount: BigInt(inputRaw),
      keypair: params.keypair,
      apiKey: params.apiKey,
      minOutAmount: minOutRaw,
      connection: params.connection,
    });
    return { signature: res.signature, source: source.symbol, outAmount: res.outAmount };
  } catch (e) {
    addLog("warn", "rebalance.swap.fail", `Basket swap ${source.symbol} → deficit failed, proceeding without: ${e instanceof Error ? e.message : String(e)}`, { source: source.symbol, deficit: params.deficitMint.slice(0, 8) });
    return null;
  }
}
