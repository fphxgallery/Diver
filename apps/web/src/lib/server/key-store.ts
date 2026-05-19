import { Keypair } from "@solana/web3.js";
import type { MonitorSettings } from "@/lib/meteora/monitor";
import { persistEntry, updatePersistedMeta, removePersistedEntry } from "./persisted-store";

export interface KeyEntry {
  keypair: Keypair;
  publicKey: string;
  expiresAt: number;
  settings: MonitorSettings;
  poolAddresses: string[];
  pairNames: Record<string, string>;
  rpcUrl: string;
}

// Pin singleton to globalThis so the instrumentation runtime and route
// handlers share the same map — Next.js can otherwise duplicate module
// instances across per-route bundles.
const g = globalThis as unknown as { __diverKeyStore?: Map<string, KeyEntry>; __diverKeyStoreCleanup?: NodeJS.Timeout };
g.__diverKeyStore ??= new Map<string, KeyEntry>();
const store: Map<string, KeyEntry> = g.__diverKeyStore;

if (!g.__diverKeyStoreCleanup) {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store) {
      if (entry.expiresAt < now) store.delete(id);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();
  g.__diverKeyStoreCleanup = cleanup;
}

export function setKey(walletId: string, entry: Omit<KeyEntry, "expiresAt">) {
  store.set(walletId, { ...entry, expiresAt: Infinity });
  const seed = entry.keypair.secretKey.slice(0, 32);
  persistEntry(walletId, seed, {
    publicKey: entry.publicKey,
    poolAddresses: entry.poolAddresses,
    pairNames: entry.pairNames,
    rpcUrl: entry.rpcUrl,
    settings: entry.settings,
  }).catch(e => console.error("[diver] Failed to persist key entry:", e));
}

// Used by boot hydration — entry came from disk, skip re-persist.
export function setKeyInMemory(walletId: string, entry: Omit<KeyEntry, "expiresAt">) {
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
    entry.keypair.secretKey.fill(0);
    store.delete(walletId);
    removePersistedEntry(walletId).catch(e => console.error("[diver] Failed to remove persisted entry:", e));
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
    updatePersistedMeta(walletId, { poolAddresses, pairNames }).catch(e => console.error("[diver] Failed to persist pool update:", e));
  }
}

export function updateSettings(walletId: string, settings: MonitorSettings) {
  const entry = store.get(walletId);
  if (entry) {
    entry.settings = settings;
    updatePersistedMeta(walletId, { settings }).catch(e => console.error("[diver] Failed to persist settings update:", e));
  }
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
