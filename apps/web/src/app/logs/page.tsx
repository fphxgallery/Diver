"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
}

const LEVEL_STYLES: Record<string, string> = {
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

const LEVEL_ROW: Record<string, string> = {
  info: "",
  warn: "bg-yellow-500/5",
  error: "bg-red-500/5",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isToday(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs");
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchLogs, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchLogs]);

  const visible = filter === "all" ? entries : entries.filter(e => e.level === filter);

  const counts = {
    info: entries.filter(e => e.level === "info").length,
    warn: entries.filter(e => e.level === "warn").length,
    error: entries.filter(e => e.level === "error").length,
  };

  return (
    <div className="flex-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-muted-foreground" />
          Server Logs
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg border transition-colors",
              autoRefresh
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <RefreshCw className={cn("w-3 h-3 inline mr-1.5", autoRefresh && "animate-spin [animation-duration:3s]")} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(["all", "info", "warn", "error"] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={cn(
              "text-xs px-3 py-1 rounded-lg border transition-colors capitalize",
              filter === lvl
                ? lvl === "all"
                  ? "border-primary/40 text-primary bg-primary/10"
                  : LEVEL_STYLES[lvl]
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {lvl}
            {lvl !== "all" && counts[lvl] > 0 && (
              <span className="ml-1.5 opacity-70">{counts[lvl]}</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{visible.length} entries</span>
      </div>

      <Card className="border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No log entries yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium w-28">Time</th>
                  <th className="text-left px-4 py-2 font-medium w-16">Level</th>
                  <th className="text-left px-4 py-2 font-medium w-44">Event</th>
                  <th className="text-left px-4 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visible.map(entry => (
                  <tr key={entry.id} className={cn("font-mono", LEVEL_ROW[entry.level])}>
                    <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">
                      <span title={new Date(entry.timestamp).toISOString()}>
                        {isToday(entry.timestamp) ? formatTime(entry.timestamp) : `${formatDate(entry.timestamp)} ${formatTime(entry.timestamp)}`}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("text-xs px-1.5 py-0.5 rounded border", LEVEL_STYLES[entry.level])}>
                        {entry.level}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.event}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {entry.message}
                      {entry.meta && Object.keys(entry.meta).length > 0 && (
                        <span className="ml-2 text-muted-foreground/60">
                          {Object.entries(entry.meta).map(([k, v]) => `${k}=${v}`).join(" ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
