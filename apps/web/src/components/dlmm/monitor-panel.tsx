"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RebalanceDialog } from "./rebalance-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useMonitorStore } from "@/store/monitor-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { healthColor, healthLabel, type PositionHealth } from "@/lib/meteora/monitor";
import { cn } from "@/lib/utils";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Zap } from "lucide-react";
import Link from "next/link";

// Password cache — in-memory only, cleared on page unload.
// User enters password once per session for auto-rebalance.
const passwordCache: Record<string, string> = {};

function HealthRow({ h, onRebalance }: { h: PositionHealth; onRebalance: (h: PositionHealth) => void }) {
  const color = healthColor(h);
  const label = healthLabel(h);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={cn("w-2 h-2 rounded-full shrink-0",
        color === "green" ? "bg-green-400" : color === "yellow" ? "bg-yellow-400" : "bg-red-400"
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/dlmm/${h.poolAddress}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
            {h.pairName}
          </Link>
          <Badge className={cn("text-xs border-0 shrink-0",
            color === "green" ? "bg-green-500/15 text-green-400" :
            color === "yellow" ? "bg-yellow-500/15 text-yellow-400" :
            "bg-red-500/15 text-red-400"
          )}>
            {label}
          </Badge>
          {h.autoRebalanceTriggered && (
            <Badge className="text-xs border-0 bg-primary/15 text-primary shrink-0">Auto-rebalanced</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>Bins {h.lowerBinId}–{h.upperBinId}</span>
          <span>Active: {h.activeBinId}</span>
          {h.inRange && <span>Edge: {h.edgeProximityPct.toFixed(0)}%</span>}
        </div>
        {h.inRange && (
          <div className="h-1 bg-secondary rounded-full mt-1.5 overflow-hidden w-32">
            <div
              className={cn("h-full rounded-full transition-all",
                color === "green" ? "bg-green-400" : "bg-yellow-400"
              )}
              style={{ width: `${h.rangeProgress}%` }}
            />
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-primary hover:bg-primary/10 shrink-0"
        onClick={() => onRebalance(h)}
      >
        <RefreshCw className="w-3 h-3 mr-1" /> Rebalance
      </Button>
    </div>
  );
}

export function MonitorPanel() {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { pairs } = useDlmmStore();
  const { health, history, running, lastRunAt, settings, loadSettings, loadHistory, runCheck, startPolling } =
    useMonitorStore();

  const [rebalanceTarget, setRebalanceTarget] = useState<PositionHealth | null>(null);
  const stopPollingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadSettings();
    loadHistory();
  }, [loadSettings, loadHistory]);

  // Build pool address list from known pairs
  const poolAddresses = pairs.map(p => p.address);
  const pairNames = Object.fromEntries(pairs.map(p => [p.address, p.name]));

  function getPassword(walletId: string): string | null {
    return passwordCache[walletId] ?? null;
  }

  // Start/stop polling based on settings
  useEffect(() => {
    if (!active || !settings.enabled || poolAddresses.length === 0) {
      stopPollingRef.current?.();
      stopPollingRef.current = null;
      return;
    }

    stopPollingRef.current?.();
    stopPollingRef.current = startPolling({
      wallets,
      activeWallet: active,
      poolAddresses,
      pairNames,
      getPassword,
    });

    return () => { stopPollingRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, settings.intervalSeconds, active?.publicKey]);

  function manualCheck() {
    if (!active || poolAddresses.length === 0) return;
    runCheck({ wallets, activeWallet: active, poolAddresses, pairNames, getPassword });
  }

  const recentHistory = history.slice(0, 10);
  const outOfRange = health.filter(h => !h.inRange).length;
  const nearEdge = health.filter(h => h.inRange && h.edgeProximityPct < 10).length;

  return (
    <>
      <Card className="border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Position Monitor</h2>
            {settings.enabled && (
              <Badge className="bg-green-500/15 text-green-400 border-0 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block mr-1 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastRunAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(lastRunAt).toLocaleTimeString()}
              </span>
            )}
            <Button size="sm" variant="outline" className="h-7" onClick={manualCheck} disabled={running}>
              <RefreshCw className={cn("w-3 h-3 mr-1", running && "animate-spin")} />
              {running ? "Checking..." : "Check Now"}
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {health.length > 0 && (
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <div className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-green-400 mb-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-lg font-semibold">{health.filter(h => h.inRange).length}</span>
              </div>
              <div className="text-xs text-muted-foreground">In Range</div>
            </div>
            <div className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-yellow-400 mb-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-lg font-semibold">{nearEdge}</span>
              </div>
              <div className="text-xs text-muted-foreground">Near Edge</div>
            </div>
            <div className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-red-400 mb-0.5">
                <XCircle className="w-3.5 h-3.5" />
                <span className="text-lg font-semibold">{outOfRange}</span>
              </div>
              <div className="text-xs text-muted-foreground">Out of Range</div>
            </div>
          </div>
        )}

        {/* Position list */}
        <div className="p-4">
          {health.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              {running ? "Scanning positions..." : "Click \"Check Now\" to scan your positions"}
            </p>
          ) : (
            <div>
              {health.map(h => (
                <HealthRow key={h.positionKey} h={h} onRebalance={setRebalanceTarget} />
              ))}
            </div>
          )}
        </div>

        {/* Rebalance history */}
        {recentHistory.length > 0 && (
          <div className="border-t border-border p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" /> Rebalance History
            </h3>
            <div className="space-y-2">
              {recentHistory.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className={r.success ? "text-green-400" : "text-red-400"}>
                    {r.success ? "✓" : "✗"}
                  </span>
                  <span className="text-muted-foreground font-mono">{r.pairName}</span>
                  <Badge className="text-xs border-0 bg-secondary text-muted-foreground h-4">
                    {r.reason.replace("_", " ")}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(r.triggeredAt).toLocaleTimeString()}
                  </span>
                  {r.txSigs[0] && (
                    <a href={`https://solscan.io/tx/${r.txSigs[0]}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline">
                      Tx
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {rebalanceTarget && (
        <RebalanceDialog
          open={true}
          onClose={() => setRebalanceTarget(null)}
          positionKey={rebalanceTarget.positionKey}
          poolAddress={rebalanceTarget.poolAddress}
          pairName={rebalanceTarget.pairName}
          lowerBinId={rebalanceTarget.lowerBinId}
          upperBinId={rebalanceTarget.upperBinId}
        />
      )}
    </>
  );
}
