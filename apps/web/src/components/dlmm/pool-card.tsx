"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MiniSparkline } from "./bin-chart";
import { formatFeeRatio, formatLiquidity, formatVolume, type DlmmPair } from "@/lib/meteora/pools";
import { TrendingUp, Droplets, Zap } from "lucide-react";
import { TokenLogo } from "./token-logo";

interface Props {
  pair: DlmmPair;
}

// Deterministic fake sparkline from APR so cards look alive before real data
function fakeSparkline(seed: number): number[] {
  return Array.from({ length: 20 }, (_, i) => {
    const x = (seed * 9301 + i * 49297) % 233280;
    return 0.4 + (x / 233280) * 0.6;
  });
}

export function PoolCard({ pair }: Props) {
  const feeRatio24h = pair.fee_tvl_ratio["24h"];
  const sparkData = fakeSparkline(pair.tvl % 1000);

  return (
    <Link href={`/dlmm/${pair.address}`}>
      <Card className="p-4 bg-card border-border hover:border-primary/40 transition-all duration-200 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              <TokenLogo mint={pair.token_x.address} symbol={pair.token_x.symbol} size={28} className="border-2 border-card" />
              <TokenLogo mint={pair.token_y.address} symbol={pair.token_y.symbol} size={28} className="border-2 border-card" />
            </div>
            <div>
              <div className="font-semibold text-sm group-hover:text-primary transition-colors">{pair.name}</div>
              <div className="text-xs text-muted-foreground">{pair.pool_config.bin_step} bin step</div>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-400 border-0">
            {formatFeeRatio(feeRatio24h)} Fee/TVL 24h
          </Badge>
        </div>

        {/* Sparkline */}
        <div className="mb-3">
          <MiniSparkline data={sparkData} height={36} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <Droplets className="w-3 h-3" /> TVL
            </div>
            <div className="font-medium">{formatLiquidity(pair.tvl)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <TrendingUp className="w-3 h-3" /> Vol 24h
            </div>
            <div className="font-medium">{formatVolume(pair.volume["24h"])}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <Zap className="w-3 h-3" /> Fees 24h
            </div>
            <div className="font-medium">{formatVolume(pair.fees["24h"])}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
