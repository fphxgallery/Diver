"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { PositionCard } from "@/components/dlmm/position-card";
import { ServerMonitor } from "@/components/dlmm/server-monitor";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { useMonitorStore } from "@/store/monitor-store";
import { formatLiquidity, formatVolume, formatFeeRatio, type DlmmPair } from "@/lib/meteora/pools";
import { Search, Layers, Activity, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";


type SortKey = "fee_tvl_24h" | "tvl" | "volume" | "fees";
type SortDir = "asc" | "desc";

function PoolTable({ pairs }: { pairs: DlmmPair[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("fee_tvl_24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...pairs].sort((a, b) => {
    const av = sortKey === "volume" ? a.volume["24h"] : sortKey === "fees" ? a.fees["24h"] : sortKey === "fee_tvl_24h" ? a.fee_tvl_ratio["24h"] : a.tvl;
    const bv = sortKey === "volume" ? b.volume["24h"] : sortKey === "fees" ? b.fees["24h"] : sortKey === "fee_tvl_24h" ? b.fee_tvl_ratio["24h"] : b.tvl;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  }

  function ColHeader({ k, label, className }: { k: SortKey; label: string; className?: string }) {
    const isRight = className?.includes("text-right");
    return (
      <th
        className={`px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? ""}`}
        onClick={() => toggleSort(k)}
      >
        <span className={`flex items-center gap-1 ${isRight ? "justify-end" : ""}`}><SortIcon k={k} />{label}</span>
      </th>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden max-w-4xl mx-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 border-b border-border">
          <tr>
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Pool</th>
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Bin Step</th>
            <ColHeader k="fee_tvl_24h" label="Fee/TVL 24h" className="text-right" />
            <ColHeader k="tvl" label="TVL" className="text-right" />
            <ColHeader k="volume" label="Vol 24h" className="text-right" />
            <ColHeader k="fees" label="Fees 24h" className="text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map(pair => (
            <tr key={pair.address} onClick={() => router.push(`/dlmm/${pair.address}`)} className="hover:bg-secondary/40 transition-colors cursor-pointer">
              <td className="px-3 py-2 font-medium">{pair.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{pair.pool_config.bin_step}</td>
              <td className="px-3 py-2 text-right font-semibold text-green-400">{formatFeeRatio(pair.fee_tvl_ratio["24h"])}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatLiquidity(pair.tvl)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatVolume(pair.volume["24h"])}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatVolume(pair.fees["24h"])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Tab = "pools" | "positions" | "monitor";

export default function DlmmPage() {
  const { wallets, activeId, hydrated } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { pairs, pairsLoading, pairsLoaded, loadPairs, getPositions, positions, discoverAndLoadPositions, positionsLoading } = useDlmmStore();
  const { settings, loadSettings } = useMonitorStore();

  const [tab, setTab] = useState<Tab>("pools");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState(pairs);
  const { searchPairs } = useDlmmStore();

  useEffect(() => { loadPairs(); loadSettings(); }, [loadPairs, loadSettings]);

  useEffect(() => {
    if (!active || !settings.lpAgentApiKey) return;
    discoverAndLoadPositions(active.publicKey, settings.lpAgentApiKey);
  }, [active?.publicKey, settings.lpAgentApiKey, discoverAndLoadPositions]);

  const filteredPairs = useMemo(() => pairs.filter(p => p.tvl >= settings.minPoolTvl), [pairs, settings.minPoolTvl]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults(filteredPairs.slice(0, 25)); return; }
    const t = setTimeout(async () => {
      const term = search.toLowerCase();
      const local = filteredPairs.filter(p => p.name.toLowerCase().includes(term) || p.address.toLowerCase().includes(term));
      if (local.length > 0) { setSearchResults(local.slice(0, 25)); return; }
      const results = await searchPairs(search);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [search, filteredPairs, searchPairs]);

  const userPositions = active ? getPositions(active.publicKey) : [];
  const inRangeCount = userPositions.filter(p => p.inRange).length;
  const outRangeCount = userPositions.filter(p => !p.inRange).length;

  return (
    <>
      <WalletHydrator />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">DLMM</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Meteora Dynamic Liquidity Market Maker</p>
          </div>
          {userPositions.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-green-400">
                <Layers className="w-4 h-4" /> {inRangeCount} in range
              </span>
              {outRangeCount > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-400">
                  <AlertTriangle className="w-4 h-4" /> {outRangeCount} out of range
                </span>
              )}
            </div>
          )}
        </div>

        {/* Nav bar */}
        <div className="flex items-center gap-3 mb-4">
          <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
            <TabsList className="bg-secondary">
              <TabsTrigger value="pools">Browse Pools</TabsTrigger>
              <TabsTrigger value="positions" className="flex items-center gap-1.5">
                My Positions
                {userPositions.length > 0 && (
                  <span className="bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {userPositions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="monitor" className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Monitor
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "pools" && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search pools..."
                className="pl-9 bg-secondary border-border h-9"
              />
            </div>
          )}
        </div>

        {/* Content */}
        {tab === "pools" && (
          <div>
            {pairsLoading ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="h-10 bg-secondary/60 border-b border-border" />
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 border-b border-border last:border-0 px-4 py-3">
                    <div className="h-4 w-32 rounded bg-secondary animate-pulse" />
                  </div>
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <Card className="p-12 text-center border-border">
                <p className="text-muted-foreground">No pools found</p>
              </Card>
            ) : (
              <PoolTable pairs={searchResults} />
            )}
          </div>
        )}

        {tab === "positions" && (
          <div>
            {!hydrated || !active ? (
              <Card className="p-12 text-center border-border">
                <p className="text-muted-foreground mb-3">No wallet selected</p>
                <Link href="/wallets"><Button size="sm">Connect Wallet</Button></Link>
              </Card>
            ) : userPositions.length === 0 ? (
              <Card className="p-12 text-center border-border">
                <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-1">No positions found</p>
                <p className="text-sm text-muted-foreground mb-4">Open a pool and create a position to start earning fees</p>
                <Button size="sm" onClick={() => setTab("pools")}>Browse Pools</Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {userPositions.map(pos => {
                  const p = pairs.find(p => p.address === pos.lbPair);
                  return <PositionCard key={pos.publicKey} position={pos} tokenXPrice={p?.token_x.price} tokenYPrice={p?.token_y.price} />;
                })}
              </div>
            )}
          </div>
        )}

        {tab === "monitor" && (
          <div className="space-y-4">
            <ServerMonitor />
          </div>
        )}
      </div>
    </>
  );
}
