const BASE = "https://lite.jupiter.ag";
const TOKEN_API = "https://tokens.jup.ag";

export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | { amount: string; feeBps: number };
  priceImpactPct: string;
  routePlan: unknown[];
  contextSlot: number;
  timeTaken: number;
}

export interface SwapResponse {
  swapTransaction: string; // base64 VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export async function getTokenList(): Promise<JupiterToken[]> {
  const res = await fetch(`${TOKEN_API}/tokens?tags=verified`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Failed to fetch token list");
  return res.json();
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}): Promise<QuoteResponse> {
  const url = new URL(`${BASE}/v6/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount.toString());
  url.searchParams.set("slippageBps", params.slippageBps.toString());
  url.searchParams.set("onlyDirectRoutes", "false");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Quote failed");
  }
  return res.json();
}

export async function getSwapTransaction(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: number | "auto";
}): Promise<SwapResponse> {
  const res = await fetch(`${BASE}/v6/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      prioritizationFeeLamports: params.prioritizationFeeLamports ?? "auto",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Swap transaction build failed");
  }
  return res.json();
}

export function formatAmount(amount: string, decimals: number): string {
  const n = Number(amount) / 10 ** decimals;
  return n < 0.001 ? n.toExponential(4) : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function toRawAmount(amount: string, decimals: number): bigint {
  const [int, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(int + fracPadded);
}

export function priceImpactLabel(pct: string): "low" | "medium" | "high" {
  const n = parseFloat(pct);
  if (n < 1) return "low";
  if (n < 5) return "medium";
  return "high";
}
