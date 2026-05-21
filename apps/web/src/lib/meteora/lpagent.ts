// All LP Agent calls go through /api/lpagent (server-side proxy).
// LP Agent blocks direct browser requests via CORS.

const PROXY = "/api/lpagent";

function headers(apiKey: string): HeadersInit {
  return { "x-lp-api-key": apiKey };
}

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
    `${PROXY}?endpoint=lp-positions%2Fopening&owner=${encodeURIComponent(owner)}&protocol=meteora`,
    { headers: headers(apiKey) }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`LP Agent ${res.status}${body.error ? `: ${body.error}` : ""}`);
  }
  const json = await res.json();
  return (json.data ?? []) as LpAgentPosition[];
}

export async function getRevenueForPeriod(owner: string, apiKey: string, range: "7D" | "1M"): Promise<number> {
  const res = await fetch(
    `${PROXY}?endpoint=${encodeURIComponent(`lp-positions/revenue/${owner}`)}&period=day&range=${range}&protocol=meteora`,
    { headers: headers(apiKey) }
  );
  if (!res.ok) throw new Error(`LP Agent revenue ${res.status}`);
  const json = await res.json();
  const data: Array<{ sum?: number }> = json.data ?? [];
  return data.reduce((acc, d) => acc + Number(d.sum ?? 0), 0);
}

export async function getTokenBalances(owner: string, apiKey: string): Promise<LpAgentTokenBalance[]> {
  const res = await fetch(
    `${PROXY}?endpoint=token-balances&owner=${encodeURIComponent(owner)}`,
    { headers: headers(apiKey) }
  );
  if (!res.ok) throw new Error(`LP Agent ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as LpAgentTokenBalance[];
}
