import { address } from "@solana/kit";
import { createRpc, type Cluster } from "./client";

export async function getSolBalance(publicKey: string, cluster: Cluster = "mainnet-beta"): Promise<number> {
  const rpc = createRpc(cluster);
  const { value } = await rpc.getBalance(address(publicKey)).send();
  return Number(value) / 1e9;
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
