/**
 * Boundary layer: wraps @meteora-ag/dlmm (which requires web3.js Connection/PublicKey)
 * so that web3.js types don't leak into the rest of the app.
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";
import { getRpcUrl, type Cluster } from "@/lib/solana/client";
export type { Cluster };
import { decryptKeystore } from "@diver/keypair-store";
import type { StoredWallet } from "@diver/keypair-store";

export function getConnection(cluster: Cluster = "mainnet-beta") {
  return new Connection(getRpcUrl(cluster), "confirmed");
}

export async function getDlmmPool(poolAddress: string, cluster: Cluster = "mainnet-beta") {
  const connection = getConnection(cluster);
  return DLMM.create(connection, new PublicKey(poolAddress));
}

export async function getDlmmPools(poolAddresses: string[], cluster: Cluster = "mainnet-beta") {
  const connection = getConnection(cluster);
  return DLMM.createMultiple(connection, poolAddresses.map(a => new PublicKey(a)));
}

export function walletToKeypair(wallet: StoredWallet, password: string): Keypair {
  const seed = decryptKeystore(wallet.keystore, password);
  return Keypair.fromSeed(seed);
}

export async function getPositions(
  poolAddress: string,
  walletPublicKey: string,
  cluster: Cluster = "mainnet-beta"
) {
  const pool = await getDlmmPool(poolAddress, cluster);
  return pool.getPositionsByUserAndLbPair(new PublicKey(walletPublicKey));
}
