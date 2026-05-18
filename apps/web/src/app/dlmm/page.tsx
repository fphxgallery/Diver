"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { PoolCard } from "@/components/dlmm/pool-card";
import { PositionCard } from "@/components/dlmm/position-card";
import { MonitorPanel } from "@/components/dlmm/monitor-panel";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { Search, Layers, Activity, AlertTriangle } from "lucide-react";
import Link from "next/link";

type Tab = "pools" | "positions" | "monitor";

export default function DlmmPage() {
  const { wallets, activeId, hydrated } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { pairs, pairsLoading, pairsLoaded, loadPairs, getPositions, positions } = useDlmmStore();

  const [tab, setTab] = useState<Tab>("pools");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState(pairs);
  const { searchPairs } = useDlmmStore();

  useEffect(() => { loadPairs(); }, [loadPairs]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults(pairs.slice(0, 50)); return; }
    const t = setTimeout(async () => {
      const results = await searchPairs(search);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [search, pairs, searchPairs]);

  const userPositions = active ? getPositions(active.publicKey) : [];
  const inRangeCount = userPositions.filter(p => p.inRange).length;
  const outRangeCount = userPositions.filter(p => !p.inRange).length;

  return (
    <>
      <WalletHydrator />
      <div className="p-6 max-w-6xl mx-auto">
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

        <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
          <div className="flex items-center gap-3 mb-4">
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

          {tab === "pools" && (
            <div>
              {pairsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(9)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-secondary animate-pulse" />)}
                </div>
              ) : searchResults.length === 0 ? (
                <Card className="p-12 text-center border-border">
                  <p className="text-muted-foreground">No pools found</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.map(pair => <PoolCard key={pair.address} pair={pair} />)}
                </div>
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
                  {userPositions.map(pos => <PositionCard key={pos.publicKey} position={pos} />)}
                </div>
              )}
            </div>
          )}
          {tab === "monitor" && <MonitorPanel />}
        </Tabs>
      </div>
    </>
  );
}
