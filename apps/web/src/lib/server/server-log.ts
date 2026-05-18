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
const log: LogEntry[] = [];
let seq = 0;

export function addLog(level: LogLevel, event: string, message: string, meta?: Record<string, string | number | boolean>) {
  const entry: LogEntry = {
    id: `${Date.now()}-${++seq}`,
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
