export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  event: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
}

const MAX_ENTRIES = 500;

// Pin to globalThis so the buffer survives Next.js per-route bundling
// (instrumentation runtime and route handlers can otherwise get separate
// module instances, each with its own array — `bigint: Failed to load
// bindings` printing twice in container logs is the smoking gun).
const g = globalThis as unknown as { __diverLog?: LogEntry[]; __diverLogSeq?: number };
g.__diverLog ??= [];
g.__diverLogSeq ??= 0;
const log: LogEntry[] = g.__diverLog;

export function addLog(level: LogLevel, event: string, message: string, meta?: Record<string, string | number | boolean>) {
  g.__diverLogSeq = (g.__diverLogSeq ?? 0) + 1;
  const entry: LogEntry = {
    id: `${Date.now()}-${g.__diverLogSeq}`,
    timestamp: Date.now(),
    level,
    event,
    message,
    meta,
  };
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.splice(MAX_ENTRIES);
}

export function getLogs(): LogEntry[] {
  return [...log];
}
