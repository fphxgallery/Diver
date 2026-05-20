export interface ValueSnapshot {
  t: number; // unix ms
  v: number; // total USD value
}

const PREFIX = "diver:value-history:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour between snapshots

function key(publicKey: string): string {
  return `${PREFIX}${publicKey}`;
}

function read(publicKey: string): ValueSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(publicKey));
    const parsed = raw ? (JSON.parse(raw) as ValueSnapshot[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function prune(snapshots: ValueSnapshot[]): ValueSnapshot[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return snapshots.filter(s => s.t >= cutoff);
}

export function getHistory(publicKey: string): ValueSnapshot[] {
  return prune(read(publicKey));
}

/**
 * Append a snapshot, throttled to once per hour. Returns the pruned series
 * (whether or not a new point was added) so callers can render immediately.
 */
export function recordSnapshot(publicKey: string, total: number): ValueSnapshot[] {
  if (typeof window === "undefined") return [];
  const existing = prune(read(publicKey));
  const last = existing[existing.length - 1];
  if (last && Date.now() - last.t < MIN_INTERVAL_MS) return existing;
  const next = [...existing, { t: Date.now(), v: total }];
  try {
    localStorage.setItem(key(publicKey), JSON.stringify(next));
  } catch {}
  return next;
}
