"use client";

import { useMemo } from "react";
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { BinData } from "@/lib/meteora/positions";

interface Props {
  bins: BinData[];
  activeBinId: number;
  minBinId?: number;
  maxBinId?: number;
  height?: number;
}

interface ChartBin {
  binId: number;
  price: number;
  xLiq: number;
  yLiq: number;
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

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartBin }> }) {
  if (!active || !payload?.[0]) return null;
  const bin = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="p-2 space-y-0.5">
      <div className="text-muted-foreground">Bin {bin.binId}</div>
      <div>Price: {bin.price.toFixed(6)}</div>
      <div className="text-blue-400">X: {bin.xLiq.toFixed(4)}</div>
      <div className="text-purple-400">Y: {bin.yLiq.toFixed(4)}</div>
    </div>
  );
}

export function BinChart({ bins, activeBinId, minBinId, maxBinId, height = 120 }: Props) {
  const data = useMemo<ChartBin[]>(() => {
    return bins.map(b => ({
      binId: b.binId,
      price: parseFloat(b.pricePerToken),
      xLiq: b.xAmount.isZero() ? 0 : parseFloat(b.xAmount.toString()) / 1e6,
      yLiq: b.yAmount.isZero() ? 0 : parseFloat(b.yAmount.toString()) / 1e6,
      total: (b.xAmount.isZero() ? 0 : parseFloat(b.xAmount.toString()) / 1e6) +
             (b.yAmount.isZero() ? 0 : parseFloat(b.yAmount.toString()) / 1e6),
      active: b.binId === activeBinId,
      inRange: minBinId !== undefined && maxBinId !== undefined
        ? b.binId >= minBinId && b.binId <= maxBinId
        : true,
    }));
  }, [bins, activeBinId, minBinId, maxBinId]);

  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-muted-foreground text-xs">No bin data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap={1} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
        <XAxis dataKey="binId" hide />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <ReferenceLine x={activeBinId} stroke="hsl(262 83% 68%)" strokeWidth={2} strokeDasharray="3 3" />
        <Bar dataKey="total" radius={[2, 2, 0, 0]}>
          {data.map(entry => (
            <Cell
              key={entry.binId}
              fill={
                entry.active
                  ? "hsl(262 83% 68%)"
                  : entry.inRange
                  ? "hsl(160 84% 39%)"
                  : "hsl(240 12% 20%)"
              }
              fillOpacity={entry.active ? 1 : entry.inRange ? 0.8 : 0.4}
            />
          ))}
        </Bar>
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
