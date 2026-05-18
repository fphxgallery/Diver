const METEORA_API = "https://dlmm.datapi.meteora.ag";

export interface DlmmPair {
  address: string;
  name: string;
  token_x: { address: string; symbol: string; decimals: number; price: number };
  token_y: { address: string; symbol: string; decimals: number; price: number };
  pool_config: { bin_step: number; base_fee_pct: number };
  tvl: number;
  current_price: number;
  apy: number;
  apr: number;
  farm_apr: number;
  farm_apy: number;
  volume: { "30m": number; "1h": number; "2h": number; "4h": number; "12h": number; "24h": number };
  fees: { "30m": number; "1h": number; "2h": number; "4h": number; "12h": number; "24h": number };
  fee_tvl_ratio: { "30m": number; "1h": number; "2h": number; "4h": number; "12h": number; "24h": number };
  is_blacklisted: boolean;
}

interface PoolsResponse {
  data: DlmmPair[];
  total: number;
}

export async function getTopPairs(limit = 50): Promise<DlmmPair[]> {
  const res = await fetch(`${METEORA_API}/pools?page=1&page_size=${limit}&sort_by=volume_24h:desc`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch DLMM pairs");
  const data = await res.json() as PoolsResponse;
  return (data.data ?? []).filter(p => !p.is_blacklisted);
}

export async function getTopAprPairs(limit = 5, minTvl = 10_000): Promise<DlmmPair[]> {
  // Fetch top-volume pools (established, real liquidity) then sort by fee/TVL client-side.
  // Sorting by APR directly returns zero-TVL pools with overflow values.
  const res = await fetch(`${METEORA_API}/pools?page=1&page_size=100&sort_by=volume_24h:desc`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch top APR pairs");
  const data = await res.json() as PoolsResponse;
  return (data.data ?? [])
    .filter(p => !p.is_blacklisted && p.tvl >= minTvl)
    .sort((a, b) => b.fee_tvl_ratio["24h"] - a.fee_tvl_ratio["24h"])
    .slice(0, limit);
}

export async function getPair(address: string): Promise<DlmmPair> {
  const res = await fetch(`${METEORA_API}/pools/${address}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Pair not found");
  return res.json() as Promise<DlmmPair>;
}

export async function searchPairs(query: string): Promise<DlmmPair[]> {
  const res = await fetch(`${METEORA_API}/pools?page=1&page_size=20&query=${encodeURIComponent(query)}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) return [];
  const data = await res.json() as PoolsResponse;
  return (data.data ?? []).filter(p => !p.is_blacklisted);
}

export function formatFeeRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

export function formatLiquidity(tvl: number): string {
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(2)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(1)}K`;
  return `$${tvl.toFixed(2)}`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(2)}`;
}
