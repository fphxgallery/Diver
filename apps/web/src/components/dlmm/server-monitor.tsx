"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { useMonitorStore } from "@/store/monitor-store";
import { decryptKeystore } from "@diver/keypair-store";
import { getRpcUrl } from "@/lib/solana/client";
import { healthColor, healthLabel, type PositionHealth, type RebalanceRecord } from "@/lib/meteora/monitor";
import { cn } from "@/lib/utils";
import { Server, Lock, Unlock, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Zap, ChevronDown, ChevronUp } from "lucide-react";


interface MonitorStatus {
  health: PositionHealth[];
  history: RebalanceRecord[];
  running: boolean;
  lastRunAt: number | null;
  error: string | null;
  unlocked: Array<{ walletId: string; publicKey: string; expiresAt: number }>;
  settingsByWallet?: Array<{ walletId: string; publicKey: string; settings: import("@/lib/meteora/monitor").MonitorSettings; rpcUrl?: string }>;
}

function useServerMonitor(pollInterval = 15_000) {
  const [status, setStatus] = useState<MonitorStatus | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor", { headers: {} });
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => { if (!cancelled) await fetch_(); };
    run();
    const id = setInterval(run, pollInterval);
    return () => { cancelled = true; clearInterval(id); };
  }, [fetch_, pollInterval]);

  return { status, refresh: fetch_ };
}

function UnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { settings } = useMonitorStore();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUnlock() {
    if (!active) return;
    setLoading(true);
    setError("");
    try {
      // Decrypt client-side — password never sent to server
      const secretKey = decryptKeystore(active.keystore, password);
      // secretKey is 64 bytes (ed25519 keypair), seed is first 32
      const seed = secretKey.slice(0, 32);
      const seedBase64 = Buffer.from(seed).toString("base64");

      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: active.id,
          publicKey: active.publicKey,
          seedBase64,
          settings,
          poolAddresses: [],
          pairNames: {},
          rpcUrl: getRpcUrl("mainnet-beta"),
        }),
      });

      if (!res.ok) {
        const { error: e } = await res.json();
        throw new Error(e ?? "Unlock failed");
      }

      setPassword("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlock");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" /> Unlock Server Monitor
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Your wallet is decrypted in the browser. Only the derived key seed is sent to the server over HTTPS — your password stays local.
          </p>
          <div>
            <Label className="mb-1.5 block">Wallet Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              placeholder="Enter wallet password"
              className="bg-secondary border-border"
              autoFocus
            />
          </div>
          <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            ⚠ Key held in server memory only. Cleared on server restart or manual lock.
          </div>
{error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleUnlock} disabled={!password || loading || !active}>
            {loading ? "Unlocking..." : "Unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function lock(walletId?: string) {
  await fetch("/api/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId }),
  });
}

export function ServerMonitor() {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { status, refresh } = useServerMonitor();
  const { positions } = useDlmmStore();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isUnlocked = status?.unlocked.some(u => u.walletId === active?.id) ?? false;

  // Sync position pools to server when the pool set actually changes.
  // Gate on stringified pool list — `positions` object identity flips on every
  // browser-side refresh, so depending on it spammed check_now every few seconds.
  const userPositions = active ? (positions[active.publicKey] ?? []) : [];
  const poolKey = useMemo(
    () => [...new Set(userPositions.map(p => p.lbPair))].sort().join(","),
    [userPositions]
  );
  const lastSyncedPoolKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isUnlocked || !active || userPositions.length === 0) return;
    if (lastSyncedPoolKey.current === poolKey) return;
    lastSyncedPoolKey.current = poolKey;

    const poolAddresses = [...new Set(userPositions.map(p => p.lbPair))];
    const pairNames = Object.fromEntries(userPositions.map(p => [p.lbPair, p.pairName]));
    fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_pools", walletId: active.id, poolAddresses, pairNames }),
    }).then(() => fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_now" }),
    })).then(() => setTimeout(refresh, 2000));
  }, [isUnlocked, active?.id, poolKey]);

  // Reset sync marker when wallet changes or locks so next unlock re-syncs.
  useEffect(() => {
    lastSyncedPoolKey.current = null;
  }, [isUnlocked, active?.id]);

  const outOfRange = status?.health.filter(h => !h.inRange).length ?? 0;
  const nearEdge = status?.health.filter(h => h.inRange && h.edgeProximityPct < 10).length ?? 0;

  async function handleLock() {
    if (!active) return;
    await lock(active.id);
    refresh();
  }

  async function handleCheckNow() {
    // Sync pools first (in case positions changed since last sync)
    const userPositions = active ? (positions[active.publicKey] ?? []) : [];
    if (active && userPositions.length > 0) {
      const poolAddresses = [...new Set(userPositions.map(p => p.lbPair))];
      const pairNames = Object.fromEntries(userPositions.map(p => [p.lbPair, p.pairName]));
      await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_pools", walletId: active.id, poolAddresses, pairNames }),
      });
    }
    await fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_now" }),
    });
    setTimeout(refresh, 2000);
  }

  return (
    <>
      <Card className="border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Server Monitor</h2>
            {isUnlocked ? (
              <Badge className="bg-green-500/15 text-green-400 border-0 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block mr-1 animate-pulse" />
                Active
              </Badge>
            ) : (
              <Badge className="bg-secondary text-muted-foreground border-0 text-xs">Locked</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.lastRunAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(status.lastRunAt).toLocaleTimeString()}
              </span>
            )}
            {isUnlocked && (
              <Button size="sm" variant="outline" className="h-7" onClick={handleCheckNow} disabled={status?.running}>
                <RefreshCw className={cn("w-3 h-3 mr-1", status?.running && "animate-spin")} />
                {status?.running ? "Checking..." : "Check Now"}
              </Button>
            )}
            {isUnlocked ? (
              <Button size="sm" variant="outline" className="h-7 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10" onClick={handleLock}>
                <Lock className="w-3 h-3 mr-1" /> Lock
              </Button>
            ) : (
              <Button size="sm" className="h-7" onClick={() => setUnlockOpen(true)} disabled={!active}>
                <Unlock className="w-3 h-3 mr-1" /> Unlock
              </Button>
            )}
          </div>
        </div>

        {!isUnlocked ? (
          <div className="p-8 text-center">
            <Server className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-1">Server monitor is locked</p>
            <p className="text-xs text-muted-foreground mb-4">Unlock to enable background monitoring — runs even when you navigate away</p>
            <Button size="sm" onClick={() => setUnlockOpen(true)} disabled={!active}>
              <Unlock className="w-3.5 h-3.5 mr-1.5" /> Unlock
            </Button>
          </div>
        ) : (
          <>
            {(status?.health.length ?? 0) > 0 && (
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                <div className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-green-400 mb-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-lg font-semibold">{status!.health.filter(h => h.inRange).length}</span>
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

            <div className="p-4">
              {(status?.health.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">
                  {status?.running ? "Scanning positions..." : "Waiting for first check..."}
                </p>
              ) : (
                <div>
                  {status!.health.map(h => {
                    const color = healthColor(h);
                    return (
                      <div key={h.positionKey} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                        <div className={cn("w-2 h-2 rounded-full shrink-0",
                          color === "green" ? "bg-green-400" : color === "yellow" ? "bg-yellow-400" : "bg-red-400"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{h.pairName}</span>
                            <Badge className={cn("text-xs border-0 shrink-0",
                              color === "green" ? "bg-green-500/15 text-green-400" :
                              color === "yellow" ? "bg-yellow-500/15 text-yellow-400" :
                              "bg-red-500/15 text-red-400"
                            )}>
                              {healthLabel(h)}
                            </Badge>
                            {h.autoRebalanceTriggered && (
                              <Badge className="text-xs border-0 bg-primary/15 text-primary shrink-0">Auto-rebalanced</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Bins {h.lowerBinId}–{h.upperBinId} · Active: {h.activeBinId}
                            {h.inRange && ` · Edge: ${h.edgeProximityPct.toFixed(0)}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(status?.history.length ?? 0) > 0 && (
              <div className="border-t border-border">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition-colors"
                  onClick={() => setHistoryOpen(v => !v)}
                >
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                    Rebalance History
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({status!.history.length} {status!.history.filter(r => !r.success).length > 0 ? `· ${status!.history.filter(r => !r.success).length} failed` : ""})
                    </span>
                  </span>
                  {historyOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                {historyOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {status!.history.slice(0, 20).map(r => (
                      <div key={r.id} className="space-y-0.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={r.success ? "text-green-400" : "text-red-400"}>{r.success ? "✓" : "✗"}</span>
                          <span className="text-muted-foreground font-mono">{r.pairName}</span>
                          <Badge className="text-xs border-0 bg-secondary text-muted-foreground h-4">
                            {r.reason.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-muted-foreground ml-auto">
                            {new Date(r.triggeredAt).toLocaleTimeString()}
                          </span>
                          {r.txSigs[0] && (
                            <a href={`https://solscan.io/tx/${r.txSigs[0]}`} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline">Tx</a>
                          )}
                        </div>
                        {!r.success && r.error && (
                          <div className="text-xs text-red-400/70 pl-4 font-mono truncate">{r.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(status?.settingsByWallet?.length ?? 0) > 0 && (
              <div className="border-t border-border p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Server Settings</h3>
                {status!.settingsByWallet!.map(sw => {
                  const s = sw.settings;
                  const flags = [
                    { label: "OOR trigger", ok: s.triggerOnOutOfRange },
                    { label: `Edge ${s.edgeProximityThresholdPct}%`, ok: s.edgeProximityThresholdPct > 0 },
                    { label: "Composition", ok: s.compositionCheckEnabled },
                    { label: "Top-up 50/50", ok: s.topUpEnabled },
                    { label: `Basket swap${s.basketSwapEnabled ? ` (${s.basket.length})` : ""}`, ok: s.basketSwapEnabled },
                  ];
                  const rpcHost = (() => { try { return sw.rpcUrl ? new URL(sw.rpcUrl).host : ""; } catch { return sw.rpcUrl?.slice(0, 40) ?? ""; } })();
                  const rpcIsPublic = rpcHost.endsWith("solana.com");
                  return (
                    <div key={sw.walletId} className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {flags.map(f => (
                          <span key={f.label} className={cn("px-1.5 py-0.5 rounded font-mono",
                            f.ok ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground"
                          )}>{f.label}</span>
                        ))}
                        <span className="text-muted-foreground ml-1">Bins: {s.defaultNumBins} · Min $: {s.minPositionValueUsd}</span>
                      </div>
                      {rpcHost && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">RPC: </span>
                          <span className={cn("font-mono", rpcIsPublic ? "text-yellow-400" : "text-green-400")}>{rpcHost}</span>
                          {rpcIsPublic && <span className="text-yellow-400/70 ml-2">(public — lock + unlock to apply private RPC)</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {status?.error && (
              <div className="border-t border-border p-4">
                <p className="text-destructive text-xs">{status.error}</p>
              </div>
            )}
          </>
        )}
      </Card>

      <UnlockDialog open={unlockOpen} onClose={() => { setUnlockOpen(false); refresh(); }} />
    </>
  );
}
