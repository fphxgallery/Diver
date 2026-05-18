"use client";

import { Card } from "@/components/ui/card";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { useWalletStore } from "@/store/wallet-store";
import { useQuery } from "@tanstack/react-query";
import { getSolBalance } from "@/lib/solana/balance";
import { getTopAprPairs, formatApr, formatLiquidity } from "@/lib/meteora/pools";
import { Layers, Wallet, TrendingUp, DollarSign } from "lucide-react";
import Link from "next/link";

function StatCard({ label, value, icon: Icon, href }: {
  label: string;
  value: string;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <Card className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const { wallets, activeId, hydrated } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);

  const { data: balance } = useQuery({
    queryKey: ["balance", active?.publicKey],
    queryFn: () => getSolBalance(active!.publicKey),
    enabled: !!active,
    refetchInterval: 30_000,
  });

  const { data: topAprPairs, isLoading: aprLoading } = useQuery({
    queryKey: ["top-apr-pairs"],
    queryFn: () => getTopAprPairs(5),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return (
    <>
      <WalletHydrator />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          {active && (
            <p className="text-muted-foreground text-sm mt-0.5 font-mono">
              {active.name} · {active.publicKey.slice(0, 6)}...{active.publicKey.slice(-6)}
            </p>
          )}
        </div>

        {!hydrated ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : !active ? (
          <Card className="p-10 border-border text-center">
            <p className="text-muted-foreground mb-4">No wallet selected</p>
            <Link href="/wallets" className="text-primary hover:underline text-sm">
              Create or import a wallet →
            </Link>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="SOL Balance"
                value={balance !== undefined ? `${balance.toFixed(4)}` : "—"}
                icon={Wallet}
                href="/wallets"
              />
              <StatCard label="DLMM Positions" value="—" icon={Layers} href="/dlmm" />
              <StatCard label="Total Value" value="—" icon={DollarSign} />
              <StatCard label="24h Fees Earned" value="—" icon={TrendingUp} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-5 border-border">
                <h2 className="font-medium mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Active DLMM Positions
                </h2>
                <p className="text-muted-foreground text-sm py-8 text-center">
                  No positions yet.{" "}
                  <Link href="/dlmm" className="text-primary hover:underline">Open DLMM →</Link>
                </p>
              </Card>
              <Card className="p-5 border-border">
                <h2 className="font-medium mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  Top APR Pools
                </h2>
                {aprLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-9 rounded-lg bg-secondary animate-pulse" />
                    ))}
                  </div>
                ) : !topAprPairs?.length ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No data available</p>
                ) : (
                  <div className="space-y-1">
                    {topAprPairs.map((pair, i) => (
                      <Link
                        key={pair.address}
                        href={`/dlmm/${pair.address}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{pair.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-muted-foreground">{formatLiquidity(pair.tvl)}</span>
                          <span className="text-sm font-semibold text-green-400">{formatApr(pair.apy)}</span>
                        </div>
                      </Link>
                    ))}
                    <div className="pt-1">
                      <Link href="/dlmm" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                        Browse all pools →
                      </Link>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
