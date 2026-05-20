import { Connection, VersionedTransaction, type Keypair } from "@solana/web3.js";
import type { OrderResponse, ExecuteResponse } from "./api";

const SWAP_API = "https://api.jup.ag/swap/v2";

function headers(apiKey: string): Record<string, string> {
  return apiKey ? { "x-api-key": apiKey } : {};
}

/**
 * Server-side swap using a raw Keypair (no browser wallet). Fetches a Jupiter
 * order, enforces a price-impact ceiling, signs the returned transaction with
 * the keypair, and lands it via Jupiter's /execute endpoint.
 */
export async function swapWithKeypair(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  keypair: Keypair;
  apiKey: string;
  maxPriceImpactPct: number;
  connection: Connection;
}): Promise<{ signature: string; inAmount: string; outAmount: string }> {
  const orderUrl = new URL(`${SWAP_API}/order`);
  orderUrl.searchParams.set("inputMint", params.inputMint);
  orderUrl.searchParams.set("outputMint", params.outputMint);
  orderUrl.searchParams.set("amount", params.amount.toString());
  orderUrl.searchParams.set("slippageBps", params.slippageBps.toString());
  orderUrl.searchParams.set("taker", params.keypair.publicKey.toBase58());

  const orderRes = await fetch(orderUrl.toString(), { headers: headers(params.apiKey), cache: "no-store" });
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}));
    throw new Error((err as { errorMessage?: string; error?: string }).errorMessage ?? (err as { error?: string }).error ?? "Swap order failed");
  }
  const order: OrderResponse = await orderRes.json();
  if (!order.transaction) throw new Error(order.errorMessage ?? order.error ?? "No swap route found");

  const impactPct = Math.abs(order.priceImpact) * 100;
  if (impactPct > params.maxPriceImpactPct) {
    throw new Error(`Swap price impact ${impactPct.toFixed(2)}% exceeds cap ${params.maxPriceImpactPct}%`);
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  tx.sign([params.keypair]);
  const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

  const execRes = await fetch(`${SWAP_API}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers(params.apiKey) },
    body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
    cache: "no-store",
  });
  if (!execRes.ok) {
    const err = await execRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Swap execute failed");
  }
  const exec: ExecuteResponse = await execRes.json();
  if (exec.status !== "Success") throw new Error(exec.error ?? `Swap failed (${exec.status})`);

  return { signature: exec.signature, inAmount: order.inAmount, outAmount: order.outAmount };
}
