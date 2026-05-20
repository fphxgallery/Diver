"use client";

import { use, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "@/store/wallet-store";
import { useMonitorStore } from "@/store/monitor-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { getPortfolioItems } from "@/lib/solana/balance";
import { getHistory, recordSnapshot, type ValueSnapshot } from "@/lib/portfolio-history";
import { ValueChart } from "@/components/wallet/value-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, CheckCircle2, Camera, X, Layers } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

async function fileToResizedDataUrl(file: File, size = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}

function TokenLogo({ symbol, logoURI }: { symbol: string; logoURI?: string }) {
  const [err, setErr] = useState(false);
  if (!logoURI || err) {
    return (
      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
        {symbol[0]}
      </div>
    );
  }
  return (
    <Image
      src={logoURI}
      alt={symbol}
      width={36}
      height={36}
      className="rounded-full shrink-0"
      onError={() => setErr(true)}
      unoptimized
    />
  );
}

export default function WalletPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { wallets, activeId, setActive, setAvatar } = useWalletStore();
  const wallet = wallets.find(w => w.id === id);
  const isActive = activeId === id;
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !wallet) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setAvatar(wallet.id, dataUrl);
    } catch {}
  }

  const { data: items, isLoading } = useQuery({
    queryKey: ["portfolio", wallet?.publicKey],
    queryFn: () => getPortfolioItems(wallet!.publicKey),
    enabled: !!wallet,
    refetchInterval: 60_000,
  });

  const { settings, loadSettings } = useMonitorStore();
  const { discoverAndLoadPositions, getLpAgentPositions, positionsLoaded } = useDlmmStore();

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (!wallet || !settings.lpAgentApiKey) return;
    discoverAndLoadPositions(wallet.publicKey, settings.lpAgentApiKey);
  }, [wallet?.publicKey, settings.lpAgentApiKey, discoverAndLoadPositions]);

  const lpPositions = wallet ? getLpAgentPositions(wallet.publicKey) : [];
  const lpLoaded = wallet ? positionsLoaded[wallet.publicKey] ?? false : false;
  const hasApiKey = !!settings.lpAgentApiKey;

  const totalUsd = items?.reduce((sum, i) => sum + i.balance * (i.usdPrice ?? 0), 0) ?? 0;
  const totalPositionValue = lpPositions.reduce((sum, p) => sum + Number(p.currentValue ?? 0), 0);
  const grandTotal = totalUsd + totalPositionValue;
  const itemsLoaded = !!items;

  const [history, setHistory] = useState<ValueSnapshot[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!wallet || !itemsLoaded) return;
    if (hasApiKey && !lpLoaded) return; // wait for positions before snapshotting the grand total
    const series = recordSnapshot(wallet.publicKey, grandTotal);
    queueMicrotask(() => setHistory(series));
  }, [wallet?.publicKey, itemsLoaded, hasApiKey, lpLoaded, grandTotal]);

  // Server-recorded history (monitor job, always-on for unlocked wallets)
  const { data: serverHistory } = useQuery({
    queryKey: ["value-history", wallet?.publicKey],
    queryFn: async () => {
      const res = await fetch(`/api/value-history?owner=${wallet!.publicKey}`);
      if (!res.ok) return [] as ValueSnapshot[];
      const json = await res.json();
      return (json.history ?? []) as ValueSnapshot[];
    },
    enabled: !!wallet,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // Merge server + local snapshots, collapse to one point per hour bucket.
  const mergedHistory = useMemo(() => {
    const byBucket = new Map<number, ValueSnapshot>();
    for (const s of [...(serverHistory ?? []), ...history]) {
      const bucket = Math.floor(s.t / (60 * 60 * 1000));
      const existing = byBucket.get(bucket);
      if (!existing || s.t >= existing.t) byBucket.set(bucket, s);
    }
    return [...byBucket.values()].sort((a, b) => a.t - b.t);
  }, [serverHistory, history]);

  function copy() {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!wallet) {
    return (
      <>
        <WalletHydrator />
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-muted-foreground">Wallet not found.</p>
          <Link href="/wallets" className="text-primary text-sm hover:underline mt-2 inline-block">← Back to wallets</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <WalletHydrator />
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link href="/wallets" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Wallets
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold overflow-hidden cursor-pointer transition-opacity hover:opacity-80",
                    !wallet.avatar && (isActive ? "bg-primary text-white" : "bg-secondary text-muted-foreground")
                  )}
                  title={wallet.avatar ? "Change picture" : "Upload picture"}
                >
                  {wallet.avatar ? (
                    <Image src={wallet.avatar} alt={wallet.name} width={44} height={44} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    wallet.name[0].toUpperCase()
                  )}
                  <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-4 h-4 text-white" />
                  </span>
                </button>
                {wallet.avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar(wallet.id, undefined)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Remove picture"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{wallet.name}</h1>
                  {isActive && <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-0">Active</Badge>}
                </div>
                <button onClick={copy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono mt-0.5">
                  <span>{wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}</span>
                  {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {!isActive && (
              <button
                onClick={() => setActive(wallet.id)}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Set as active
              </button>
            )}
          </div>
        </div>

        {/* Portfolio value chart */}
        <ValueChart history={mergedHistory} currentValue={grandTotal} now={nowTick} />

        {/* Token list */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Tokens</h2>
            <span className="text-base font-semibold">${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
              ))}
            </div>
          ) : !items?.length ? (
            <Card className="p-6 text-center text-muted-foreground text-sm border-border">No tokens found</Card>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <Card key={item.mint} className="border-border bg-card">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <TokenLogo symbol={item.symbol} logoURI={item.logoURI} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{item.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium text-sm">
                        {item.balance.toLocaleString("en-US", { maximumFractionDigits: item.decimals > 6 ? 4 : item.decimals })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.usdPrice !== undefined
                          ? `$${(item.balance * item.usdPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : item.symbol}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Open DLMM positions */}
        {hasApiKey && (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Open DLMM Positions
              </h2>
              {lpLoaded && lpPositions.length > 0 && (
                <span className="text-base font-semibold">${totalPositionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              )}
            </div>
            {!lpLoaded ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
                ))}
              </div>
            ) : !lpPositions.length ? (
              <Card className="p-6 text-center text-muted-foreground text-sm border-border">No open positions</Card>
            ) : (
              <div className="space-y-2">
                {lpPositions.map(pos => (
                  <Link key={pos.position} href={`/dlmm/${pos.pool}`} className="block">
                    <Card className="border-border bg-card hover:border-primary/40 transition-colors">
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{pos.pairName}</div>
                          <div className={cn("text-xs font-medium", pos.inRange ? "text-green-400" : "text-yellow-400")}>
                            {pos.inRange ? "In Range" : "Out of Range"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-medium text-sm">
                            ${Number(pos.currentValue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {pos.yield24h != null && (
                            <div className="text-xs text-green-400">+${Number(pos.yield24h).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/24h</div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
