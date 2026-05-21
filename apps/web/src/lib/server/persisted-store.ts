import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { promises as fs } from "fs";
import path from "path";
import type { MonitorSettings } from "@/lib/meteora/monitor";

const STORE_VERSION = 1;

interface PersistedEntry {
  encSeed: string;
  iv: string;
  publicKey: string;
  poolAddresses: string[];
  pairNames: Record<string, string>;
  rpcUrl: string;
  settings: MonitorSettings;
}

interface PersistedFile {
  version: number;
  entries: Record<string, PersistedEntry>;
}

function getServerKey(): Uint8Array | null {
  const secret = process.env.DIVER_SERVER_SECRET;
  if (!secret) return null;
  const bytes = Buffer.from(secret, "hex");
  if (bytes.length !== 32) {
    console.error("[diver] DIVER_SERVER_SECRET must be 32 bytes (64 hex chars) — persistence disabled");
    return null;
  }
  return new Uint8Array(bytes);
}

function getDataPath(): string {
  const dir = process.env.DIVER_DATA_DIR ?? "./data";
  return path.join(dir, "monitor-keys.json");
}

function toHex(b: Uint8Array) { return Buffer.from(b).toString("hex"); }
function fromHex(h: string) { return new Uint8Array(Buffer.from(h, "hex")); }

async function readFile(): Promise<PersistedFile> {
  try {
    const raw = await fs.readFile(getDataPath(), "utf-8");
    const parsed = JSON.parse(raw);
    // Backward-compat: pre-version file was a bare entries map
    if (parsed && typeof parsed === "object" && "version" in parsed && "entries" in parsed) {
      return parsed as PersistedFile;
    }
    return { version: STORE_VERSION, entries: parsed as Record<string, PersistedEntry> };
  } catch {
    return { version: STORE_VERSION, entries: {} };
  }
}

async function writeFileAtomic(file: PersistedFile): Promise<void> {
  const p = getDataPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await fs.rename(tmp, p);
}

// Serialize all read-modify-write operations to avoid clobbering.
// Pinned to globalThis so Turbopack bundle duplication doesn't create a second chain.
const g = globalThis as unknown as { __diverPersistChain?: Promise<unknown> };
g.__diverPersistChain ??= Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = (g.__diverPersistChain as Promise<unknown>).then(fn, fn);
  g.__diverPersistChain = next.catch(() => {});
  return next;
}

export async function persistEntry(
  walletId: string,
  seed: Uint8Array,
  meta: {
    publicKey: string;
    poolAddresses: string[];
    pairNames: Record<string, string>;
    rpcUrl: string;
    settings: MonitorSettings;
  }
): Promise<void> {
  const key = getServerKey();
  if (!key) return;

  return withWriteLock(async () => {
    const iv = randomBytes(12);
    const encSeed = gcm(key, iv).encrypt(seed);

    const file = await readFile();
    file.version = STORE_VERSION;
    file.entries[walletId] = {
      encSeed: toHex(encSeed),
      iv: toHex(iv),
      publicKey: meta.publicKey,
      poolAddresses: meta.poolAddresses,
      pairNames: meta.pairNames,
      rpcUrl: meta.rpcUrl,
      settings: meta.settings,
    };
    await writeFileAtomic(file);
  });
}

export async function updatePersistedMeta(
  walletId: string,
  updates: Partial<Pick<PersistedEntry, "poolAddresses" | "pairNames" | "settings" | "rpcUrl">>
): Promise<void> {
  const key = getServerKey();
  if (!key) return;

  return withWriteLock(async () => {
    const file = await readFile();
    if (!file.entries[walletId]) return;
    file.entries[walletId] = { ...file.entries[walletId], ...updates };
    file.version = STORE_VERSION;
    await writeFileAtomic(file);
  });
}

export async function removePersistedEntry(walletId: string): Promise<void> {
  const key = getServerKey();
  if (!key) return;

  return withWriteLock(async () => {
    const file = await readFile();
    if (!file.entries[walletId]) return;
    delete file.entries[walletId];
    file.version = STORE_VERSION;
    await writeFileAtomic(file);
  });
}

export async function loadPersistedEntries(): Promise<
  Array<{
    walletId: string;
    seed: Uint8Array;
    publicKey: string;
    poolAddresses: string[];
    pairNames: Record<string, string>;
    rpcUrl: string;
    settings: MonitorSettings;
  }>
> {
  const key = getServerKey();
  if (!key) return [];

  const file = await readFile();
  if (file.version !== STORE_VERSION) {
    console.error(`[diver] Persisted store version ${file.version} unsupported (expected ${STORE_VERSION}) — skipping load`);
    return [];
  }

  const results = [];
  for (const [walletId, entry] of Object.entries(file.entries)) {
    try {
      const seed = gcm(key, fromHex(entry.iv)).decrypt(fromHex(entry.encSeed));
      results.push({
        walletId,
        seed,
        publicKey: entry.publicKey,
        poolAddresses: entry.poolAddresses,
        pairNames: entry.pairNames,
        rpcUrl: entry.rpcUrl,
        settings: entry.settings,
      });
    } catch {
      console.error(`[diver] Failed to decrypt persisted entry for wallet ${walletId} — skipping`);
    }
  }
  return results;
}
