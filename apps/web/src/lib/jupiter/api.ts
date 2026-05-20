const SWAP_API = "https://api.jup.ag/swap/v2";
const TOKEN_SEARCH_API = "https://lite-api.jup.ag/tokens/v2/search";

function apiKey(): string {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("diver:jupiter-api-key");
    if (stored) return stored;
  }
  return process.env.NEXT_PUBLIC_JUPITER_API_KEY ?? "";
}

function jupHeaders(): HeadersInit {
  const key = apiKey();
  return key ? { "x-api-key": key } : {};
}

export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

export interface OrderResponse {
  transaction: string | null;
  requestId: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpact: number;
  lastValidBlockHeight: string;
  /** Winning router: "iris" (Metis), "jupiterz" (RFQ), "dflow", "okx" */
  router?: string;
  /** "ultra" = all routers competed (default params); "manual" = restricted by optional params */
  mode?: string;
  errorCode?: number;
  errorMessage?: string;
  error?: string;
}

export interface ExecuteResponse {
  status: "Success" | "Failed";
  signature: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
  error?: string;
  code?: number;
}

interface JupSearchResult {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  tags?: string[];
}

export async function searchTokens(query: string): Promise<JupiterToken[]> {
  const url = new URL(TOKEN_SEARCH_API);
  if (query) url.searchParams.set("query", query);
  url.searchParams.set("limit", "30");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];
  const data: JupSearchResult[] = await res.json();
  return (Array.isArray(data) ? data : []).map(t => ({
    address: t.id,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    logoURI: t.icon,
    tags: t.tags,
  }));
}

export async function getSwapOrder(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  /** Omit for Ultra mode (all routers compete, auto slippage). Setting it forces manual mode. */
  slippageBps?: number;
  taker: string;
}): Promise<OrderResponse> {
  const url = new URL(`${SWAP_API}/order`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount.toString());
  // Any optional param (incl. slippageBps) demotes the order from "ultra" to "manual"
  // mode, which disables the JupiterZ/Dflow/OKX routers. Only send it when explicitly set.
  if (params.slippageBps !== undefined) url.searchParams.set("slippageBps", params.slippageBps.toString());
  url.searchParams.set("taker", params.taker);

  const res = await fetch(url.toString(), { headers: jupHeaders(), cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string; errorMessage?: string }).errorMessage ?? (err as { error?: string }).error ?? "Order failed");
  }
  const order: OrderResponse = await res.json();
  if (!order.transaction) {
    throw new Error(order.errorMessage ?? order.error ?? "No route found");
  }
  return order;
}

export async function executeSwap(params: {
  signedTransaction: string;
  requestId: string;
}): Promise<ExecuteResponse> {
  const res = await fetch(`${SWAP_API}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jupHeaders() },
    body: JSON.stringify({ signedTransaction: params.signedTransaction, requestId: params.requestId }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Execute failed");
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

/** USD prices via Jupiter price v3 (lite-api, no key needed). Missing mints omitted. */
export async function getUsdPrices(mints: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(mints)].filter(Boolean).join(",");
  if (!ids) return {};
  try {
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`, { cache: "no-store" });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, { usdPrice?: number }>;
    const out: Record<string, number> = {};
    for (const [m, d] of Object.entries(json)) {
      const p = Number(d?.usdPrice ?? 0);
      if (p > 0) out[m] = p;
    }
    return out;
  } catch {
    return {};
  }
}

export function impactLevel(pct: number): "low" | "medium" | "high" {
  const abs = Math.abs(pct);
  if (abs < 1) return "low";
  if (abs < 5) return "medium";
  return "high";
}
