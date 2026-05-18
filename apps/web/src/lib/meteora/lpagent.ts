const BASE_URL = "https://api.lpagent.io/open-api/v1";

export interface LpAgentPosition {
  position: string;
  pool: string;
  pairName: string;
  inRange: boolean;
  token0: string;
  token1: string;
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
