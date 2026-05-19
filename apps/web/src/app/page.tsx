"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { useWalletStore } from "@/store/wallet-store";
import { useQuery } from "@tanstack/react-query";
import { getSolBalance } from "@/lib/solana/balance";
import { getTopAprPairs, formatFeeRatio, formatLiquidity } from "@/lib/meteora/pools";
import { getOpeningPositions, getTokenBalances, getRevenueForPeriod } from "@/lib/meteora/lpagent";
import { useMonitorStore } from "@/store/monitor-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { Layers, Wallet, TrendingUp, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

function StatCard({ label, value, sub, icon: Icon, href }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <Card className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

type FeesPeriod = "7D" | "1M";

function FeesCard({ value, loading, period, onPeriod }: {
  value: string;
  loading: boolean;
  period: FeesPeriod;
  onPeriod: (p: FeesPeriod) => void;
}) {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-muted-foreground text-sm">Fees Earned</p>
            <div className="flex items-center gap-0.5">
              {(["7D", "1M"] as FeesPeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => onPeriod(p)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
                    period === p ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <p className="text-2xl font-semibold">{loading ? "..." : value}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { wallets, activeId, hydrated } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { settings, loadSettings } = useMonitorStore();
  const { discoverAndLoadPositions, getPositions } = useDlmmStore();

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (!active || !settings.lpAgentApiKey) return;
    discoverAndLoadPositions(active.publicKey, settings.lpAgentApiKey);
  }, [active?.publicKey, settings.lpAgentApiKey, discoverAndLoadPositions]);

  const userPositions = active ? getPositions(active.publicKey) : [];

  const hasApiKey = !!active && !!settings.lpAgentApiKey;
  const [feesPeriod, setFeesPeriod] = useState<FeesPeriod>("7D");

  const { data: lpPositions, isPending: lpPending } = useQuery({
    queryKey: ["lp-positions-financial", active?.publicKey, settings.lpAgentApiKey],
    queryFn: () => getOpeningPositions(active!.publicKey, settings.lpAgentApiKey),
    enabled: hasApiKey,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: tokenBalances } = useQuery({
    queryKey: ["token-balances", active?.publicKey, settings.lpAgentApiKey],
    queryFn: () => getTokenBalances(active!.publicKey, settings.lpAgentApiKey),
    enabled: hasApiKey,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: fees7d, isPending: fees7dPending } = useQuery({
    queryKey: ["revenue-7d", active?.publicKey, settings.lpAgentApiKey],
    queryFn: () => getRevenueForPeriod(active!.publicKey, settings.lpAgentApiKey, "7D"),
    enabled: hasApiKey && feesPeriod === "7D",
    staleTime: 5 * 60_000,
  });

  const { data: fees1m, isPending: fees1mPending } = useQuery({
    queryKey: ["revenue-1m", active?.publicKey, settings.lpAgentApiKey],
    queryFn: () => getRevenueForPeriod(active!.publicKey, settings.lpAgentApiKey, "1M"),
    enabled: hasApiKey && feesPeriod === "1M",
    staleTime: 5 * 60_000,
  });

  const feesValue = feesPeriod === "7D" ? fees7d : fees1m;
  const feesLoading = feesPeriod === "7D" ? fees7dPending : fees1mPending;

  const totalPositionValue = lpPositions?.reduce((sum, p) => sum + Number(p.currentValue ?? 0), 0) ?? 0;
  const totalWalletValue = tokenBalances?.reduce((sum, t) => sum + Number(t.balanceInUsd ?? 0), 0) ?? 0;
  const totalValue = totalPositionValue + totalWalletValue;

  const { data: balance } = useQuery({
    queryKey: ["balance", active?.publicKey],
    queryFn: () => getSolBalance(active!.publicKey),
    enabled: !!active,
    refetchInterval: 30_000,
  });

  const { data: solPrice } = useQuery({
    queryKey: ["sol-price"],
    queryFn: async () => {
      const res = await fetch("https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112");
      const json = await res.json();
      return json.data?.["So11111111111111111111111111111111111111112"]?.price as number | undefined;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: topAprPairs, isLoading: aprLoading } = useQuery({
    queryKey: ["top-apr-pairs", settings.minPoolTvl],
    queryFn: () => getTopAprPairs(5, settings.minPoolTvl),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return (
    <>
      <WalletHydrator />
      <div className="pt-32 px-6 pb-6 max-w-5xl mx-auto">
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
                sub={solPrice !== undefined && balance !== undefined
                  ? `≈ $${(balance * solPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · $${solPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/SOL`
                  : undefined}
                icon={Wallet}
                href="/wallets"
              />
              <StatCard label="DLMM Positions" value={String(userPositions.length)} icon={Layers} href="/dlmm" />
              <StatCard
                label="Total Value"
                value={!hasApiKey ? "—" : lpPending ? "..." : `$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={DollarSign}
              />
              <FeesCard
                value={!hasApiKey ? "—" : feesValue !== undefined ? `$${feesValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                loading={hasApiKey && feesLoading && feesValue === undefined}
                period={feesPeriod}
                onPeriod={setFeesPeriod}
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-5 border-border">
                <h2 className="font-medium mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Active DLMM Positions
                </h2>
                {userPositions.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No positions yet.{" "}
                    <Link href="/dlmm" className="text-primary hover:underline">Open DLMM →</Link>
                  </p>
                ) : (
                  <div className="space-y-1">
                    {userPositions.map(pos => (
                      <Link
                        key={pos.publicKey}
                        href={`/dlmm/${pos.lbPair}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary transition-colors group"
                      >
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">{pos.pairName}</span>
                        <span className={`text-xs font-medium ${pos.inRange ? "text-green-400" : "text-yellow-400"}`}>
                          {pos.inRange ? "In Range" : "Out of Range"}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-5 border-border">
                <h2 className="font-medium mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  Top Pools by 24h Fee/TVL
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
                          <span className="text-sm font-semibold text-green-400">{formatFeeRatio(pair.fee_tvl_ratio["24h"])}</span>
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
