"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import type { ValueSnapshot } from "@/lib/portfolio-history";

interface Props {
  history: ValueSnapshot[];
  currentValue: number;
  now: number;
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(240 14% 9%)",
  border: "1px solid hsl(240 10% 12%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(240 10% 95%)",
};

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ValueSnapshot }> }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="p-2 space-y-0.5">
      <div className="text-muted-foreground">{new Date(p.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
      <div className="font-medium">{fmtUsd(p.v)}</div>
    </div>
  );
}

export function ValueChart({ history, currentValue, now }: Props) {
  const data = useMemo(() => {
    // Always end the series on the live current value so the chart matches the headline.
    const base = history.length ? history : [];
    const last = base[base.length - 1];
    if (!last || last.v !== currentValue) {
      return [...base, { t: Math.max(now, (last?.t ?? 0) + 1), v: currentValue }];
    }
    return base;
  }, [history, currentValue, now]);

  const enoughPoints = data.length >= 2;
  const first = data[0]?.v ?? currentValue;
  const change = currentValue - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const up = change >= 0;

  return (
    <Card className="p-5 border-border">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-muted-foreground text-sm">Portfolio value</p>
          <p className="text-3xl font-semibold mt-0.5">{fmtUsd(currentValue)}</p>
        </div>
        {enoughPoints && (
          <div className={`text-sm font-medium mt-6 ${up ? "text-green-400" : "text-red-400"}`}>
            {up ? "+" : ""}{fmtUsd(change)} ({up ? "+" : ""}{changePct.toFixed(2)}%)
          </div>
        )}
      </div>
      {enoughPoints ? (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(262 83% 68%)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(262 83% 68%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="v" stroke="hsl(262 83% 68%)" strokeWidth={2} fill="url(#valueFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground">
          Building history — a value point is saved hourly while you view this page.
        </div>
      )}
    </Card>
  );
}
