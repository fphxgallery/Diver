const METEORA_API = "https://dlmm-api.meteora.ag";

export interface DlmmPair {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  token_x_decimals?: number;
  token_y_decimals?: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

export interface DlmmPairsResponse {
  groups?: Array<{ name: string; pairs: DlmmPair[] }>;
  data?: DlmmPair[];
}

export async function getTopPairs(limit = 50): Promise<DlmmPair[]> {
  const res = await fetch(`${METEORA_API}/pair/all_with_pagination?page=0&limit=${limit}&sort_key=volume&order_by=desc`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch DLMM pairs");
  const data = await res.json() as { data?: DlmmPair[]; pairs?: DlmmPair[] };
  return (data.data ?? data.pairs ?? []).filter((p: DlmmPair) => !p.hide);
}

export async function getPair(address: string): Promise<DlmmPair> {
  const res = await fetch(`${METEORA_API}/pair/${address}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Pair not found");
  return res.json() as Promise<DlmmPair>;
}

export async function searchPairs(query: string): Promise<DlmmPair[]> {
  const res = await fetch(`${METEORA_API}/pair/all_with_pagination?page=0&limit=20&search_term=${encodeURIComponent(query)}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) return [];
  const data = await res.json() as { data?: DlmmPair[]; pairs?: DlmmPair[] };
  return (data.data ?? data.pairs ?? []).filter((p: DlmmPair) => !p.hide);
}

export function formatApr(apr: number): string {
  return `${(apr * 100).toFixed(2)}%`;
}

export function formatLiquidity(liq: string): string {
  const n = parseFloat(liq);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(2)}`;
}
