"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "@/store/wallet-store";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { getPortfolioItems } from "@/lib/solana/balance";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
  const { wallets, activeId, setActive } = useWalletStore();
  const wallet = wallets.find(w => w.id === id);
  const isActive = activeId === id;
  const [copied, setCopied] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["portfolio", wallet?.publicKey],
    queryFn: () => getPortfolioItems(wallet!.publicKey),
    enabled: !!wallet,
    refetchInterval: 60_000,
  });

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

  const totalSol = items?.find(i => i.symbol === "SOL")?.balance;

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
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shrink-0",
                isActive ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
              )}>
                {wallet.name[0].toUpperCase()}
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
            <div className="text-right">
              {totalSol !== undefined && (
                <div className="text-2xl font-semibold">{totalSol.toFixed(4)} SOL</div>
              )}
              {!isActive && (
                <button
                  onClick={() => setActive(wallet.id)}
                  className="text-xs text-primary hover:underline mt-1 block"
                >
                  Set as active
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Token list */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Tokens</h2>
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
                <Card key={item.mint} className="p-3 border-border bg-card flex items-center gap-3">
                  <TokenLogo symbol={item.symbol} logoURI={item.logoURI} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{item.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium text-sm">
                      {item.balance.toLocaleString("en-US", { maximumFractionDigits: item.decimals > 6 ? 4 : item.decimals })}
                    </div>
                    <div className="text-xs text-muted-foreground">{item.symbol}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
