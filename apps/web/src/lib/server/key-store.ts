import { Keypair } from "@solana/web3.js";
import type { MonitorSettings } from "@/lib/meteora/monitor";

export interface KeyEntry {
  keypair: Keypair;
  publicKey: string;
  expiresAt: number;
  settings: MonitorSettings;
  poolAddresses: string[];
  pairNames: Record<string, string>;
  rpcUrl: string;
}

// Module-level singleton — survives across requests in the same Node.js process
const store = new Map<string, KeyEntry>();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt < now) store.delete(id);
  }
}, 60_000);
// Don't keep the process alive just for cleanup
if (cleanup.unref) cleanup.unref();

export function setKey(walletId: string, entry: Omit<KeyEntry, "expiresAt">) {
  store.set(walletId, { ...entry, expiresAt: Infinity });
}

export function getKey(walletId: string): KeyEntry | null {
  const entry = store.get(walletId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(walletId);
    return null;
  }
  return entry;
}

export function clearKey(walletId: string) {
  const entry = store.get(walletId);
  if (entry) {
    // Zero out the secret key bytes before GC
    entry.keypair.secretKey.fill(0);
    store.delete(walletId);
  }
}

export function clearAll() {
  for (const [id] of store) clearKey(id);
}

export function updatePools(walletId: string, poolAddresses: string[], pairNames: Record<string, string>) {
  const entry = store.get(walletId);
  if (entry) {
    entry.poolAddresses = poolAddresses;
    entry.pairNames = pairNames;
  }
}

export function updateSettings(walletId: string, settings: MonitorSettings) {
  const entry = store.get(walletId);
  if (entry) entry.settings = settings;
}

export function listUnlocked(): Array<{ walletId: string; publicKey: string; expiresAt: number }> {
  const now = Date.now();
  const result: Array<{ walletId: string; publicKey: string; expiresAt: number }> = [];
  for (const [walletId, entry] of store) {
    if (entry.expiresAt > now) result.push({ walletId, publicKey: entry.publicKey, expiresAt: entry.expiresAt });
  }
  return result;
}

export function getAll(): KeyEntry[] {
  const now = Date.now();
  return [...store.values()].filter(e => e.expiresAt > now);
}
