"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { BinData } from "@/lib/meteora/positions";

interface Props {
  bins: BinData[];
  activeBinId: number;
  minBinId?: number;
  maxBinId?: number;
  height?: number;
  tokenXSymbol?: string;
  tokenYSymbol?: string;
  tokenXDecimals?: number;
  tokenYDecimals?: number;
  tokenXPrice?: number;
  tokenYPrice?: number;
}

interface ChartBin {
  binId: number;
  price: number;
  xLiq: number;
  yLiq: number;
  xUsd: number;
  yUsd: number;
  xBar: number;
  yBar: number;
  total: number;
  active: boolean;
  inRange: boolean;
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(240 14% 9%)",
  border: "1px solid hsl(240 10% 12%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(240 10% 95%)",
};

function CustomTooltip({ active, payload, tokenXSymbol, tokenYSymbol }: {
  active?: boolean;
  payload?: Array<{ payload: ChartBin }>;
  tokenXSymbol?: string;
  tokenYSymbol?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const bin = payload[0].payload;
  const showUsd = bin.xUsd > 0 || bin.yUsd > 0;
  return (
    <div style={TOOLTIP_STYLE} className="p-2 space-y-0.5">
      <div className="text-muted-foreground">Bin {bin.binId}{bin.active ? " (active)" : ""}</div>
      <div className="text-purple-400">
        {tokenXSymbol ?? "X"}: {bin.xLiq.toFixed(4)}{showUsd ? ` ($${bin.xUsd.toFixed(2)})` : ""}
      </div>
      <div className="text-cyan-400">
        {tokenYSymbol ?? "Y"}: {bin.yLiq.toFixed(4)}{showUsd ? ` ($${bin.yUsd.toFixed(2)})` : ""}
      </div>
    </div>
  );
}

export function BinChart({ bins, activeBinId, minBinId, maxBinId, height = 120, tokenXSymbol, tokenYSymbol, tokenXDecimals = 6, tokenYDecimals = 6, tokenXPrice, tokenYPrice }: Props) {
  const data = useMemo<ChartBin[]>(() => {
    return bins.map(b => {
      const xLiq = b.xAmount.isZero() ? 0 : parseFloat(b.xAmount.toString()) / 10 ** tokenXDecimals;
      const yLiq = b.yAmount.isZero() ? 0 : parseFloat(b.yAmount.toString()) / 10 ** tokenYDecimals;
      const xUsd = tokenXPrice ? xLiq * tokenXPrice : 0;
      const yUsd = tokenYPrice ? yLiq * tokenYPrice : 0;
      const xBar = tokenXPrice ? xUsd : xLiq;
      const yBar = tokenYPrice ? yUsd : yLiq;
      return {
        binId: b.binId,
        price: parseFloat(b.pricePerToken),
        xLiq,
        yLiq,
        xUsd,
        yUsd,
        total: xBar + yBar,
        active: b.binId === activeBinId,
        inRange: minBinId !== undefined && maxBinId !== undefined
          ? b.binId >= minBinId && b.binId <= maxBinId
          : true,
        xBar,
        yBar,
      };
    });
  }, [bins, activeBinId, minBinId, maxBinId, tokenXDecimals, tokenYDecimals, tokenXPrice, tokenYPrice]);

  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-muted-foreground text-xs">No bin data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap={1} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
        <XAxis dataKey="binId" hide />
        <Tooltip
          content={<CustomTooltip tokenXSymbol={tokenXSymbol} tokenYSymbol={tokenYSymbol} />}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <ReferenceLine x={activeBinId} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
        <Bar dataKey="xBar" stackId="liq" fill="hsl(262 83% 68%)" fillOpacity={0.85} radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="yBar" stackId="liq" fill="hsl(186 85% 55%)" fillOpacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniSparkline({ data, height = 40 }: { data: number[]; height?: number }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barCategoryGap={0} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <Bar dataKey="v" fill="hsl(160 84% 39%)" fillOpacity={0.8} radius={[1, 1, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
