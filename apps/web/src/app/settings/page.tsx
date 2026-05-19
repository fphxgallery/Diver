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
import { CheckCircle2, Server, RefreshCw, Zap, Filter, Key } from "lucide-react";

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
    const storedRpc = typeof window !== "undefined" ? localStorage.getItem("diver:rpc-url") : null;
    setRpcUrl(storedRpc ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com");
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

      {/* Pool Filters */}
      <Section title="Pool Filters" icon={Filter}>
        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">Minimum TVL</Label>
            <div className="flex gap-2 flex-wrap">
              {[20_000, 50_000, 70_000, 100_000].map(v => (
                <button key={v} onClick={() => saveSetting("minPoolTvl", v)}
                  className={cn("px-3 py-1.5 rounded-lg text-sm transition-colors",
                    settings.minPoolTvl === v ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}>
                  {`$${v / 1_000}K`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Custom:</span>
            <Input
              type="number"
              value={settings.minPoolTvl}
              onChange={e => saveSetting("minPoolTvl", parseFloat(e.target.value) || 0)}
              className="bg-secondary border-border w-32"
              min={0}
              step={1000}
            />
            <span className="text-sm text-muted-foreground">USD</span>
          </div>
          <p className="text-xs text-muted-foreground">Hides pools below this TVL in the browse table and top pools dashboard.</p>
        </div>
      </Section>

      {/* Monitor */}
      <Section title="Server Monitor" icon={RefreshCw}>
        <div className="space-y-4">
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

      {/* Integrations */}
      <Section title="Integrations" icon={Key}>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">LP Agent API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={settings.lpAgentApiKey}
                onChange={e => saveSetting("lpAgentApiKey", e.target.value)}
                placeholder="your-api-key"
                className="bg-secondary border-border font-mono text-sm flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Used to auto-discover your open DLMM positions. Get a key at lpagent.io.</p>
          </div>
          <div>
            <Label className="mb-1.5 block">Jupiter API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={settings.jupiterApiKey}
                onChange={e => saveSetting("jupiterApiKey", e.target.value)}
                placeholder="your-api-key"
                className="bg-secondary border-border font-mono text-sm flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Used for token swaps. Get a key at developers.jup.ag/portal.</p>
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
              {[0, 5, 10, 15, 20, 25, 30].map(v => (
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
              {[2, 5, 10, 20, 40, 69].map(n => (
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

          <Separator />

          {/* Composition check */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Composition Filter</div>
              <div className="text-xs text-muted-foreground">Only rebalance when token X is within the set % range of total value</div>
            </div>
            <button
              onClick={() => saveSetting("compositionCheckEnabled", !settings.compositionCheckEnabled)}
              className={cn("w-10 h-6 rounded-full transition-colors relative",
                settings.compositionCheckEnabled ? "bg-primary" : "bg-secondary border border-border"
              )}>
              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                settings.compositionCheckEnabled && "translate-x-4"
              )} />
            </button>
          </div>

          {settings.compositionCheckEnabled && (
            <div className="space-y-2 pl-1">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Token X value range (% of total position value)</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">Min</span>
                  <Input
                    type="number"
                    value={settings.minXRatioPct}
                    onChange={e => saveSetting("minXRatioPct", Math.min(parseFloat(e.target.value) || 0, settings.maxXRatioPct - 1))}
                    className="bg-secondary border-border w-20 text-sm"
                    min={0}
                    max={99}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <span className="text-muted-foreground">–</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">Max</span>
                  <Input
                    type="number"
                    value={settings.maxXRatioPct}
                    onChange={e => saveSetting("maxXRatioPct", Math.max(parseFloat(e.target.value) || 0, settings.minXRatioPct + 1))}
                    className="bg-secondary border-border w-20 text-sm"
                    min={1}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Default 40–60%. Single-sided positions (≈0% or ≈100%) will be skipped.</p>
            </div>
          )}

          <Separator />

          {/* 50/50 top-up */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Auto Top-Up (50/50)</div>
              <div className="text-xs text-muted-foreground">On each rebalance, add the deficit token from your wallet to equalize X and Y USD value. Wallet must hold reserves of both tokens.</div>
            </div>
            <button
              onClick={() => saveSetting("topUpEnabled", !settings.topUpEnabled)}
              className={cn("w-10 h-6 rounded-full transition-colors relative shrink-0 ml-4",
                settings.topUpEnabled ? "bg-primary" : "bg-secondary border border-border"
              )}>
              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                settings.topUpEnabled && "translate-x-4"
              )} />
            </button>
          </div>

          <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            ⚠ Auto-rebalance runs server-side using the keypair unlocked in Server Monitor. Unlock your wallet there to enable automatic rebalancing.
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
