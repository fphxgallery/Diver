"use client";

import { useEffect, useState, useCallback } from "react";
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
import { healthColor, healthLabel, type PositionHealth, type RebalanceRecord } from "@/lib/meteora/monitor";
import { cn } from "@/lib/utils";
import { Server, Lock, Unlock, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Zap } from "lucide-react";

const PIN = process.env.NEXT_PUBLIC_DIVER_PIN ?? "";

function authHeaders(): Record<string, string> {
  return PIN ? { Authorization: `Bearer ${PIN}` } : {};
}

interface MonitorStatus {
  health: PositionHealth[];
  history: RebalanceRecord[];
  running: boolean;
  lastRunAt: number | null;
  error: string | null;
  unlocked: Array<{ walletId: string; publicKey: string; expiresAt: number }>;
}

function useServerMonitor(pollInterval = 15_000) {
  const [status, setStatus] = useState<MonitorStatus | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor", { headers: authHeaders() });
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, pollInterval);
    return () => clearInterval(id);
  }, [fetch_, pollInterval]);

  return { status, refresh: fetch_ };
}

function UnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { pairs } = useDlmmStore();
  const { settings } = useMonitorStore();
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState(8);
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

      const poolAddresses = pairs.map(p => p.address);
      const pairNames = Object.fromEntries(pairs.map(p => [p.address, p.name]));

      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          walletId: active.id,
          publicKey: active.publicKey,
          seedBase64,
          ttlHours: ttl,
          settings,
          poolAddresses,
          pairNames,
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
          <div>
            <Label className="mb-1.5 block">Session TTL</Label>
            <div className="flex gap-2">
              {[4, 8, 24].map(h => (
                <button key={h} onClick={() => setTtl(h)}
                  className={cn("flex-1 py-1.5 rounded-lg text-sm transition-colors",
                    ttl === h ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}>
                  {h}h
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            ⚠ Key held in server memory only. Cleared on server restart or TTL expiry.
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
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ walletId }),
  });
}

export function ServerMonitor() {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { status, refresh } = useServerMonitor();
  const [unlockOpen, setUnlockOpen] = useState(false);

  const isUnlocked = status?.unlocked.some(u => u.walletId === active?.id) ?? false;
  const myEntry = status?.unlocked.find(u => u.walletId === active?.id);
  const ttlMs = myEntry ? myEntry.expiresAt - Date.now() : 0;
  const ttlHours = Math.max(0, ttlMs / 3_600_000).toFixed(1);

  const outOfRange = status?.health.filter(h => !h.inRange).length ?? 0;
  const nearEdge = status?.health.filter(h => h.inRange && h.edgeProximityPct < 10).length ?? 0;

  async function handleLock() {
    if (!active) return;
    await lock(active.id);
    refresh();
  }

  async function handleCheckNow() {
    await fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
                Active · {ttlHours}h left
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
              <div className="border-t border-border p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-muted-foreground" /> Rebalance History
                </h3>
                <div className="space-y-2">
                  {status!.history.slice(0, 10).map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className={r.success ? "text-green-400" : "text-red-400"}>{r.success ? "✓" : "✗"}</span>
                      <span className="text-muted-foreground font-mono">{r.pairName}</span>
                      <Badge className="text-xs border-0 bg-secondary text-muted-foreground h-4">
                        {r.reason.replace("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground ml-auto">
                        {new Date(r.triggeredAt).toLocaleTimeString()}
                      </span>
                      {r.txSigs[0] && (
                        <a href={`https://solscan.io/tx/${r.txSigs[0]}`} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline">Tx</a>
                      )}
                    </div>
                  ))}
                </div>
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
