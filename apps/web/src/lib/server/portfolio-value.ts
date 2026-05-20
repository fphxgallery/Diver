import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface Holding {
  mint: string;
  amount: number; // UI amount (decimal-adjusted)
}

/** Wallet SOL + SPL/Token-2022 holdings with non-zero balance, via the given RPC. */
export async function getWalletHoldings(owner: string, rpcUrl: string): Promise<Holding[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const ownerPk = new PublicKey(owner);

  const [solLamports, legacy, t22] = await Promise.all([
    connection.getBalance(ownerPk),
    connection.getParsedTokenAccountsByOwner(ownerPk, { programId: new PublicKey(TOKEN_PROGRAM) }),
    connection.getParsedTokenAccountsByOwner(ownerPk, { programId: new PublicKey(TOKEN_2022_PROGRAM) }),
  ]);

  const holdings: Holding[] = [{ mint: NATIVE_SOL_MINT, amount: solLamports / LAMPORTS_PER_SOL }];
  for (const acc of [...legacy.value, ...t22.value]) {
    const info = (acc.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number } } } }).parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.uiAmount ?? 0;
    if (mint && amount > 0) holdings.push({ mint, amount });
  }
  return holdings;
}

/** Batch USD prices for the given mints via Jupiter price v3. Missing mints are omitted. */
export async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(mints)].filter(Boolean);
  const out: Record<string, number> = {};
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, { usdPrice?: number }>;
      for (const [mint, d] of Object.entries(json)) {
        const p = Number(d?.usdPrice ?? 0);
        if (p > 0) out[mint] = p;
      }
    } catch {
      // skip chunk on failure — partial pricing is acceptable
    }
  }
  return out;
}
