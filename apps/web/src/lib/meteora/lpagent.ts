const BASE_URL = "https://api.lpagent.io/open-api/v1";

export interface LpAgentPosition {
  position: string;
  pool: string;
  pairName: string;
  inRange: boolean;
  token0: string;
  token1: string;
  currentValue: number;
  yield24h: number | null;
}

export interface LpAgentTokenBalance {
  tokenAddress: string;
  symbol: string;
  balance: number;
  balanceInUsd: number;
  price: number;
  logo: string;
  decimals: number;
}

export async function getOpeningPositions(owner: string, apiKey: string): Promise<LpAgentPosition[]> {
  const res = await fetch(
    `${BASE_URL}/lp-positions/opening?owner=${encodeURIComponent(owner)}&protocol=meteora`,
    { headers: { "x-api-key": apiKey } }
  );
  if (!res.ok) throw new Error(`LP Agent ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as LpAgentPosition[];
}

export async function getRevenueForPeriod(owner: string, apiKey: string, range: "7D" | "1M"): Promise<number> {
  const res = await fetch(
    `${BASE_URL}/lp-positions/revenue/${encodeURIComponent(owner)}?period=day&range=${range}&protocol=meteora`,
    { headers: { "x-api-key": apiKey } }
  );
  if (!res.ok) throw new Error(`LP Agent revenue ${res.status}`);
  const json = await res.json();
  const data: Array<{ sum?: number }> = json.data ?? [];
  return data.reduce((acc, d) => acc + Number(d.sum ?? 0), 0);
}

export async function getTokenBalances(owner: string, apiKey: string): Promise<LpAgentTokenBalance[]> {
  const res = await fetch(
    `${BASE_URL}/token-balances?owner=${encodeURIComponent(owner)}`,
    { headers: { "x-api-key": apiKey } }
  );
  if (!res.ok) throw new Error(`LP Agent ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as LpAgentTokenBalance[];
}
