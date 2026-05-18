"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { BinChart } from "@/components/dlmm/bin-chart";
import { NewPositionDialog } from "@/components/dlmm/new-position-dialog";
import { PositionCard } from "@/components/dlmm/position-card";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { getPair, formatFeeRatio, formatLiquidity, formatVolume, type DlmmPair } from "@/lib/meteora/pools";
import { getPoolBins, getUserPositions, isPositionInRange, type BinData, type PositionInfo } from "@/lib/meteora/positions";
import { ArrowLeft, Plus, Droplets, TrendingUp, Zap, Activity } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TokenLogo } from "@/components/dlmm/token-logo";

interface UserPositionWithMeta extends PositionInfo {
  pairName: string;
  inRange: boolean;
  activeBinId: number;
}

export default function PoolDetailPage() {
  const { pool: poolAddress } = useParams<{ pool: string }>();
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const invalidate = useDlmmStore(s => s.invalidatePositions);

  const [pair, setPair] = useState<DlmmPair | null>(null);
  const [pairLoading, setPairLoading] = useState(true);
  const [bins, setBins] = useState<BinData[]>([]);
  const [activeBinId, setActiveBinId] = useState(0);
  const [binsLoading, setBinsLoading] = useState(true);
  const [positions, setPositions] = useState<UserPositionWithMeta[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [newPositionOpen, setNewPositionOpen] = useState(false);

  useEffect(() => {
    getPair(poolAddress)
      .then(setPair)
      .catch(() => {})
      .finally(() => setPairLoading(false));

    getPoolBins(poolAddress, -100, 100)
      .then(({ bins: b, activeBinId: a }) => {
        setBins(b);
        setActiveBinId(a);
        // Reload with correct range once we know active bin
        return getPoolBins(poolAddress, a - 60, a + 60);
      })
      .then(({ bins: b, activeBinId: a }) => { setBins(b); setActiveBinId(a); })
      .catch(() => {})
      .finally(() => setBinsLoading(false));
  }, [poolAddress]);

  useEffect(() => {
    if (!active) return;
    setPositionsLoading(true);
    getUserPositions(poolAddress, active.publicKey)
      .then(({ userPositions, activeBinId: a }) => {
        setPositions(userPositions.map(p => ({
          ...p,
          pairName: pair?.name ?? poolAddress.slice(0, 8),
          inRange: isPositionInRange(p, a),
          activeBinId: a,
        })));
      })
      .catch(() => {})
      .finally(() => setPositionsLoading(false));
  }, [poolAddress, active, pair]);

  function refreshPositions() {
    if (!active || !pair) return;
    if (active) invalidate(active.publicKey);
    getUserPositions(poolAddress, active.publicKey)
      .then(({ userPositions, activeBinId: a }) => {
        setPositions(userPositions.map(p => ({
          ...p,
          pairName: pair.name,
          inRange: isPositionInRange(p, a),
          activeBinId: a,
        })));
      })
      .catch(() => {});
  }

  if (pairLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-32 bg-secondary rounded animate-pulse" />
        <div className="h-40 bg-secondary rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="p-6">
        <Link href="/dlmm" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <p className="text-muted-foreground">Pool not found</p>
      </div>
    );
  }

  return (
    <>
      <WalletHydrator />
      <div className="p-6 max-w-4xl mx-auto">
        {/* Back nav */}
        <Link href="/dlmm" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4 w-fit">
          <ArrowLeft className="w-4 h-4" /> All Pools
        </Link>

        {/* Pool header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <TokenLogo mint={pair.token_x.address} symbol={pair.token_x.symbol} size={40} className="border-2 border-background" />
              <TokenLogo mint={pair.token_y.address} symbol={pair.token_y.symbol} size={40} className="border-2 border-background" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{pair.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{pair.pool_config.bin_step} step</Badge>
                <Badge variant="secondary" className="text-xs">{pair.pool_config.base_fee_pct}% fee</Badge>
                <span className="text-xs text-muted-foreground font-mono">{poolAddress.slice(0, 8)}…</span>
              </div>
            </div>
          </div>
          <Button onClick={() => setNewPositionOpen(true)} disabled={!active}>
            <Plus className="w-4 h-4 mr-2" /> New Position
          </Button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "TVL", value: formatLiquidity(pair.tvl), icon: Droplets },
            { label: "Volume 24h", value: formatVolume(pair.volume["24h"]), icon: TrendingUp },
            { label: "Fees 24h", value: formatVolume(pair.fees["24h"]), icon: Zap },
            { label: "Fee/TVL 24h", value: formatFeeRatio(pair.fee_tvl_ratio["24h"]), icon: Activity, highlight: true },
          ].map(({ label, value, icon: Icon, highlight }) => (
            <Card key={label} className={cn("p-4 border-border", highlight && "border-green-500/30")}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Icon className="w-3 h-3" /> {label}
              </div>
              <div className={cn("text-xl font-semibold", highlight && "text-green-400")}>{value}</div>
            </Card>
          ))}
        </div>

        {/* Bin distribution */}
        <Card className="p-4 border-border mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Bin Distribution</h2>
            <span className="text-xs text-muted-foreground">Active bin: <span className="text-primary">{activeBinId}</span></span>
          </div>
          {binsLoading ? (
            <div className="h-32 rounded-lg bg-secondary animate-pulse" />
          ) : (
            <BinChart bins={bins} activeBinId={activeBinId} height={140} />
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> Liquidity</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary inline-block" /> Active bin</span>
          </div>
        </Card>

        {/* User positions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Your Positions</h2>
            {positions.length > 0 && (
              <Button size="sm" variant="outline" onClick={refreshPositions}>Refresh</Button>
            )}
          </div>
          {!active ? (
            <Card className="p-8 text-center border-border">
              <p className="text-muted-foreground text-sm">Select a wallet to view positions</p>
            </Card>
          ) : positionsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-secondary animate-pulse" />)}
            </div>
          ) : positions.length === 0 ? (
            <Card className="p-8 text-center border-border">
              <p className="text-muted-foreground text-sm mb-3">No positions in this pool</p>
              <Button size="sm" onClick={() => setNewPositionOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Create Position
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {positions.map(pos => <PositionCard key={pos.publicKey} position={pos} />)}
            </div>
          )}
        </div>
      </div>

      {pair && (
        <NewPositionDialog
          open={newPositionOpen}
          onClose={() => { setNewPositionOpen(false); refreshPositions(); }}
          pair={pair}
        />
      )}
    </>
  );
}
