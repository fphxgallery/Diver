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
  const result = await rpc.getTokenAccountsByOwner(
    address(publicKey),
    { programId: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") },
    { encoding: "jsonParsed" }
  ).send();
  return result.value;
}
