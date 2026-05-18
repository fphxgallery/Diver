import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

export type Cluster = "mainnet-beta" | "devnet" | "localnet";

const RPC_URLS: Record<Cluster, string> = {
  "mainnet-beta": process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const WS_URLS: Record<Cluster, string> = {
  "mainnet-beta": process.env.NEXT_PUBLIC_WS_URL ?? "wss://api.mainnet-beta.solana.com",
  devnet: "wss://api.devnet.solana.com",
  localnet: "ws://127.0.0.1:8900",
};

export function getRpcUrl(cluster: Cluster = "mainnet-beta") {
  if (cluster === "mainnet-beta" && typeof window !== "undefined") {
    const saved = localStorage.getItem("diver:rpc-url");
    if (saved) return saved;
  }
  return RPC_URLS[cluster];
}

export function createRpc(cluster: Cluster = "mainnet-beta") {
  return createSolanaRpc(getRpcUrl(cluster));
}

export function createRpcSubscriptions(cluster: Cluster = "mainnet-beta") {
  return createSolanaRpcSubscriptions(WS_URLS[cluster]);
}
