"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMonitorStore } from "@/store/monitor-store";
import { StrategyType } from "@meteora-ag/dlmm";
import { cn } from "@/lib/utils";
import { CheckCircle2, Server, RefreshCw, Zap } from "lucide-react";

const RPC_PRESETS = [
  { label: "Mainnet (public)", value: "https://api.mainnet-beta.solana.com" },
  { label: "Devnet", value: "https://api.devnet.solana.com" },
];

const STRATEGY_OPTIONS = [
  { value: StrategyType.Spot, label: "Spot", desc: "Uniform" },
  { value: StrategyType.Curve, label: "Curve", desc: "Concentrated" },
  { value: StrategyType.BidAsk, label: "Bid-Ask", desc: "Bimodal" },
];

const INTERVAL_OPTIONS = [
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
];

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="p-5 border-border">
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </h2>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const { settings, loadSettings, saveSettings } = useMonitorStore();
  const [rpcUrl, setRpcUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
    setRpcUrl(process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com");
  }, [loadSettings]);

  function persistRpc() {
    if (typeof window !== "undefined") localStorage.setItem("diver:rpc-url", rpcUrl);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function saveSetting<K extends keyof typeof settings>(key: K, value: typeof settings[K]) {
    saveSettings({ [key]: value });
    flash();
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* RPC */}
      <Section title="RPC Endpoint" icon={Server}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {RPC_PRESETS.map(p => (
              <button key={p.value} onClick={() => setRpcUrl(p.value)}
                className={cn("px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  rpcUrl === p.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={rpcUrl} onChange={e => setRpcUrl(e.target.value)}
              placeholder="https://your-rpc.com" className="bg-secondary border-border font-mono text-sm flex-1" />
            <Button size="sm" onClick={persistRpc} variant="outline">Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">Changes take effect on next page load. Use a private RPC for production.</p>
        </div>
      </Section>

      {/* Monitor */}
      <Section title="Position Monitor" icon={RefreshCw}>
        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Auto-Monitor</div>
              <div className="text-xs text-muted-foreground">Poll positions while the app is open</div>
            </div>
            <button
              onClick={() => saveSetting("enabled", !settings.enabled)}
              className={cn("w-10 h-6 rounded-full transition-colors relative",
                settings.enabled ? "bg-primary" : "bg-secondary border border-border"
              )}>
              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                settings.enabled && "translate-x-4"
              )} />
            </button>
          </div>

          <Separator />

          {/* Interval */}
          <div>
            <Label className="mb-2 block">Check Interval</Label>
            <div className="flex gap-2">
              {INTERVAL_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => saveSetting("intervalSeconds", opt.value)}
                  className={cn("flex-1 py-1.5 rounded-lg text-sm transition-colors",
                    settings.intervalSeconds === opt.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Auto-rebalance */}
      <Section title="Auto-Rebalance" icon={Zap}>
        <div className="space-y-4">
          {/* Trigger: out of range */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Trigger on Out-of-Range</div>
              <div className="text-xs text-muted-foreground">Rebalance automatically when price exits position range</div>
            </div>
            <button
              onClick={() => saveSetting("triggerOnOutOfRange", !settings.triggerOnOutOfRange)}
              className={cn("w-10 h-6 rounded-full transition-colors relative",
                settings.triggerOnOutOfRange ? "bg-primary" : "bg-secondary border border-border"
              )}>
              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                settings.triggerOnOutOfRange && "translate-x-4"
              )} />
            </button>
          </div>

          {/* Edge proximity threshold */}
          <div>
            <Label className="mb-1.5 block">
              Edge Proximity Trigger
              <span className="text-muted-foreground font-normal ml-2">
                (rebalance when active bin is within X% of edge · 0 = disabled)
              </span>
            </Label>
            <div className="flex gap-2 items-center">
              {[0, 5, 10, 15].map(v => (
                <button key={v} onClick={() => saveSetting("edgeProximityThresholdPct", v)}
                  className={cn("px-3 py-1 rounded-lg text-sm transition-colors",
                    settings.edgeProximityThresholdPct === v ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}>
                  {v === 0 ? "Off" : `${v}%`}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Default strategy */}
          <div>
            <Label className="mb-2 block">Default Rebalance Strategy</Label>
            <div className="grid grid-cols-3 gap-2">
              {STRATEGY_OPTIONS.map(s => (
                <button key={s.value} onClick={() => saveSetting("defaultStrategyType", s.value)}
                  className={cn("p-3 rounded-xl border text-left transition-all",
                    settings.defaultStrategyType === s.value ? "border-primary bg-primary/10" : "border-border bg-secondary hover:border-primary/40"
                  )}>
                  <div className={cn("text-sm font-semibold", settings.defaultStrategyType === s.value && "text-primary")}>{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Default bin count */}
          <div>
            <Label className="mb-2 block">Default Bin Width</Label>
            <div className="flex gap-2">
              {[10, 20, 40, 69].map(n => (
                <button key={n} onClick={() => saveSetting("defaultNumBins", n)}
                  className={cn("flex-1 py-1.5 rounded-lg text-sm transition-colors",
                    settings.defaultNumBins === n ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Min value */}
          <div>
            <Label className="mb-1.5 block">Min Position Value (USD) — skip smaller positions</Label>
            <Input
              type="number"
              value={settings.minPositionValueUsd}
              onChange={e => saveSetting("minPositionValueUsd", parseFloat(e.target.value) || 0)}
              className="bg-secondary border-border w-32"
              min={0}
            />
          </div>

          <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            ⚠ Auto-rebalance requires your wallet password to be cached in memory for the session. You will be prompted to enter it before each rebalance unless you cache it.
          </div>
        </div>
      </Section>

      {saved && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-green-500 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          <CheckCircle2 className="w-4 h-4" /> Saved
        </div>
      )}
    </div>
  );
}
