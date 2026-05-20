import { promises as fs } from "fs";
import path from "path";

export interface ValueSnapshot {
  t: number; // unix ms
  v: number; // total USD value
}

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour between snapshots

type HistoryFile = Record<string, ValueSnapshot[]>;

function getDataPath(): string {
  const dir = process.env.DIVER_DATA_DIR ?? "./data";
  return path.join(dir, "value-history.json");
}

async function readFile(): Promise<HistoryFile> {
  try {
    const raw = await fs.readFile(getDataPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as HistoryFile) : {};
  } catch {
    return {};
  }
}

async function writeFileAtomic(file: HistoryFile): Promise<void> {
  const p = getDataPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file), "utf-8");
  await fs.rename(tmp, p);
}

function prune(snapshots: ValueSnapshot[]): ValueSnapshot[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return snapshots.filter(s => s.t >= cutoff);
}

// Serialize read-modify-write to avoid clobbering concurrent updates.
const g = globalThis as unknown as { __diverValueHistoryChain?: Promise<unknown> };
g.__diverValueHistoryChain ??= Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = (g.__diverValueHistoryChain as Promise<unknown>).then(fn, fn);
  g.__diverValueHistoryChain = next.catch(() => {});
  return next;
}

export async function recordValueSnapshot(publicKey: string, total: number): Promise<void> {
  if (!Number.isFinite(total) || total < 0) return;
  return withWriteLock(async () => {
    const file = await readFile();
    const existing = prune(file[publicKey] ?? []);
    const last = existing[existing.length - 1];
    if (last && Date.now() - last.t < MIN_INTERVAL_MS) return; // throttle
    file[publicKey] = [...existing, { t: Date.now(), v: total }];
    await writeFileAtomic(file);
  });
}

export async function getValueHistory(publicKey: string): Promise<ValueSnapshot[]> {
  const file = await readFile();
  return prune(file[publicKey] ?? []);
}
