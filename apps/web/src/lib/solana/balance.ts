import { address } from "@solana/kit";
import { createRpc, type Cluster } from "./client";

export async function getSolBalance(publicKey: string, cluster: Cluster = "mainnet-beta"): Promise<number> {
  const rpc = createRpc(cluster);
  const { value } = await rpc.getBalance(address(publicKey)).send();
  return Number(value) / 1e9;
}

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export async function getTokenBalance(publicKey: string, mint: string, cluster: Cluster = "mainnet-beta"): Promise<number> {
  if (mint === NATIVE_SOL_MINT) {
    const bal = await getSolBalance(publicKey, cluster);
    return Math.max(0, bal - 0.01); // reserve for rent/fees
  }
  const accounts = await getTokenAccounts(publicKey, cluster);
  const match = accounts.find(a => {
    const info = (a.account.data as { parsed?: { info?: { mint?: string } } }).parsed?.info;
    return info?.mint === mint;
  });
  if (!match) return 0;
  const info = (match.account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } }).parsed?.info;
  return info?.tokenAmount?.uiAmount ?? 0;
}

export async function getTokenAccounts(publicKey: string, cluster: Cluster = "mainnet-beta") {
  const rpc = createRpc(cluster);
  const [legacy, t22] = await Promise.allSettled([
    rpc.getTokenAccountsByOwner(address(publicKey), { programId: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }, { encoding: "jsonParsed" }).send(),
    rpc.getTokenAccountsByOwner(address(publicKey), { programId: address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") }, { encoding: "jsonParsed" }).send(),
  ]);
  return [
    ...(legacy.status === "fulfilled" ? legacy.value.value : []),
    ...(t22.status === "fulfilled" ? t22.value.value : []),
  ];
}

export interface PortfolioItem {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  balance: number;
  decimals: number;
  usdPrice?: number;
}

export async function getPortfolioItems(publicKey: string, cluster: Cluster = "mainnet-beta"): Promise<PortfolioItem[]> {
const [solBalance, accounts] = await Promise.all([
    getSolBalance(publicKey, cluster),
    getTokenAccounts(publicKey, cluster),
  ]);

  // Parse SPL tokens with non-zero balance
  const splTokens = accounts
    .map(a => {
      const info = (a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number; decimals?: number } } } }).parsed?.info;
      return {
        mint: info?.mint ?? "",
        balance: info?.tokenAmount?.uiAmount ?? 0,
        decimals: info?.tokenAmount?.decimals ?? 0,
      };
    })
    .filter(t => t.mint && t.balance > 0);

  // Enrich with Jupiter metadata in parallel
  const enriched = await Promise.all(
    splTokens.map(async t => {
      try {
        const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${t.mint}&limit=1`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json() as Array<{ id?: string; symbol?: string; name?: string; icon?: string; usdPrice?: number }>;
        const match = data.find(d => d.id === t.mint) ?? data[0];
        return {
          mint: t.mint,
          symbol: match?.symbol ?? t.mint.slice(0, 6),
          name: match?.name ?? "Unknown",
          logoURI: match?.icon,
          balance: t.balance,
          decimals: t.decimals,
          usdPrice: match?.usdPrice,
        };
      } catch {
        return {
          mint: t.mint,
          symbol: t.mint.slice(0, 6),
          name: "Unknown",
          balance: t.balance,
          decimals: t.decimals,
        };
      }
    })
  );

  let solPrice: number | undefined;
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${NATIVE_SOL_MINT}&limit=1`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as Array<{ usdPrice?: number }>;
      solPrice = data[0]?.usdPrice;
    }
  } catch {}

  const sol: PortfolioItem = {
    mint: NATIVE_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    balance: solBalance,
    decimals: 9,
    usdPrice: solPrice,
  };

  return [sol, ...enriched.sort((a, b) => (b.balance * (b.usdPrice ?? 0)) - (a.balance * (a.usdPrice ?? 0)))];
}
