"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BinChart } from "./bin-chart";
import { SignDialog } from "@/components/wallet/sign-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import {
  StrategyType,
  getPoolBins,
  buildCreatePosition,
  getBinRangeAroundActive,
  type BinData,
} from "@/lib/meteora/positions";
import { formatFeeRatio } from "@/lib/meteora/pools";
import { getTokenBalance } from "@/lib/solana/balance";
import { signAndSendTransaction } from "@/lib/solana/send";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import BN from "bn.js";
import type { DlmmPair } from "@/lib/meteora/pools";

interface Props {
  open: boolean;
  onClose: () => void;
  pair: DlmmPair;
}

interface Strategy {
  type: StrategyType;
  label: string;
  description: string;
}

const STRATEGIES: Strategy[] = [
  { type: StrategyType.Spot, label: "Spot", description: "Uniform distribution. Best for stable pairs." },
  { type: StrategyType.Curve, label: "Curve", description: "Concentrated around active bin. Best for pegged assets." },
  { type: StrategyType.BidAsk, label: "Bid-Ask", description: "Bimodal distribution. Best for volatile pairs." },
];

const PCT_RANGE_OPTIONS = [10, 25, 50, 100];

// 69 bins max: position account = 112 bytes × numBins; Solana caps inner-ix realloc at 10240 bytes
const MAX_BINS = 69;

function pctToNumBins(pct: number, binStep: number): number {
  return Math.min(MAX_BINS, Math.max(2, Math.round((pct / 100) * binStep)));
}

export function NewPositionDialog({ open, onClose, pair }: Props) {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const invalidate = useDlmmStore(s => s.invalidatePositions);

  const [strategy, setStrategy] = useState<StrategyType>(StrategyType.Spot);
  const [selectedPct, setSelectedPct] = useState(25);
  const numBins = pctToNumBins(selectedPct, pair.pool_config.bin_step);
  const [amountX, setAmountX] = useState("");
  const [amountY, setAmountY] = useState("");
  const [autoFill, setAutoFill] = useState(true);
  const lastEdited = useRef<"x" | "y" | null>(null);

  const [bins, setBins] = useState<BinData[]>([]);
  const [activeBinId, setActiveBinId] = useState(0);
  const [binsLoading, setBinsLoading] = useState(false);

  const [balanceX, setBalanceX] = useState(0);
  const [balanceY, setBalanceY] = useState(0);

  const [signOpen, setSignOpen] = useState(false);
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState("");

  const { minBinId, maxBinId } = getBinRangeAroundActive(activeBinId, numBins);

  useEffect(() => {
    if (!open || !active) return;
    getTokenBalance(active.publicKey, pair.token_x.address).then(setBalanceX);
    getTokenBalance(active.publicKey, pair.token_y.address).then(setBalanceY);
  }, [open, active, pair.token_x.address, pair.token_y.address]);

  useEffect(() => {
    if (!open) return;
    setBinsLoading(true);
    getPoolBins(pair.address, activeBinId - 50, activeBinId + 50)
      .then(({ bins: b, activeBinId: a }) => {
        setBins(b);
        setActiveBinId(a);
      })
      .catch(() => {})
      .finally(() => setBinsLoading(false));
  }, [open, pair.address]);

  // Reload bins when activeBinId known
  useEffect(() => {
    if (activeBinId === 0) return;
    getPoolBins(pair.address, activeBinId - 50, activeBinId + 50)
      .then(({ bins: b }) => setBins(b));
  }, [activeBinId, pair.address]);

  async function handleCreate(password: string) {
    if (!active) throw new Error("No wallet");
    const xRaw = parseFloat(amountX || "0");
    const yRaw = parseFloat(amountY || "0");
    if (xRaw <= 0 && yRaw <= 0) throw new Error("Enter at least one amount");

    const decimalsX = pair.token_x.decimals;
    const decimalsY = pair.token_y.decimals;
    const totalX = new BN(Math.floor(xRaw * 10 ** decimalsX));
    const totalY = new BN(Math.floor(yRaw * 10 ** decimalsY));

    const { txs } = await buildCreatePosition({
      poolAddress: pair.address,
      wallet: active,
      password,
      minBinId,
      maxBinId,
      totalXAmount: totalX,
      totalYAmount: totalY,
      strategyType: strategy,
      cluster: "mainnet-beta",
    });

    let lastSig = "";
    for (const tx of txs) {
      lastSig = await signAndSendTransaction(tx, active, password);
    }

    setTxSig(lastSig);
    invalidate(active.publicKey);
    setSignOpen(false);
  }

  const priceRatio = pair.token_x.price && pair.token_y.price ? pair.token_x.price / pair.token_y.price : null;

  function handleAmountX(val: string) {
    lastEdited.current = "x";
    setAmountX(val);
    if (autoFill && priceRatio && val && parseFloat(val) > 0) {
      setAmountY((parseFloat(val) * priceRatio).toFixed(6));
    }
  }

  function handleAmountY(val: string) {
    lastEdited.current = "y";
    setAmountY(val);
    if (autoFill && priceRatio && val && parseFloat(val) > 0) {
      setAmountX((parseFloat(val) / priceRatio).toFixed(6));
    }
  }

  function reset() {
    setAmountX("");
    setAmountY("");
    setAutoFill(true);
    lastEdited.current = null;
    setTxSig("");
    setError("");
    onClose();
  }

  const [tokenA, tokenB] = pair.name.split("-");

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Position — {pair.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Strategy */}
            <div>
              <Label className="mb-2 block">Strategy</Label>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGIES.map(s => (
                  <button
                    key={s.type}
                    onClick={() => setStrategy(s.type)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      strategy === s.type
                        ? "border-primary bg-primary/10 glow-purple"
                        : "border-border bg-secondary hover:border-primary/40"
                    )}
                  >
                    <div className="font-semibold text-sm">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bin range */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Bin Range</Label>
                <div className="flex gap-1">
                  {PCT_RANGE_OPTIONS.map(pct => (
                    <button
                      key={pct}
                      onClick={() => setSelectedPct(pct)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs transition-colors",
                        selectedPct === pct ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      ±{pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Bins {minBinId} → {maxBinId} ({numBins} bins · active: {activeBinId})
              </div>
              {binsLoading ? (
                <div className="h-24 rounded-lg bg-secondary animate-pulse" />
              ) : (
                <BinChart bins={bins} activeBinId={activeBinId} minBinId={minBinId} maxBinId={maxBinId} height={100} />
              )}
            </div>

            {/* Amounts */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Amount</Label>
                <button
                  onClick={() => setAutoFill(v => !v)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className={cn("w-9 h-5 rounded-full relative transition-colors", autoFill ? "bg-primary" : "bg-secondary")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", autoFill ? "translate-x-4" : "translate-x-0.5")} />
                  </div>
                  Auto-Fill
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: tokenA, value: amountX, handler: handleAmountX, halfHandler: () => handleAmountX((balanceX / 2).toFixed(6)), maxHandler: () => handleAmountX(balanceX.toFixed(6)), balance: balanceX },
                  { label: tokenB, value: amountY, handler: handleAmountY, halfHandler: () => handleAmountY((balanceY / 2).toFixed(6)), maxHandler: () => handleAmountY(balanceY.toFixed(6)), balance: balanceY },
                ] as const).map(({ label, value, handler, halfHandler, maxHandler, balance }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <Label className="text-xs font-medium">{label}</Label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={halfHandler} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors">50%</button>
                        <button onClick={maxHandler} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors">Max</button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1.5">
                      Balance: {balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                    <Input
                      value={value}
                      onChange={e => handler(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      min="0"
                      className="bg-secondary border-border"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-secondary rounded-lg p-3 space-y-1">
              <div className="flex justify-between"><span>Pool fee</span><span>{pair.pool_config.base_fee_pct}%</span></div>
              <div className="flex justify-between"><span>Bin step</span><span>{pair.pool_config.bin_step}</span></div>
              <div className="flex justify-between"><span>Fee/TVL 24h</span><Badge className="text-xs bg-green-500/10 text-green-400 border-0 h-4">{formatFeeRatio(pair.fee_tvl_ratio["24h"])}</Badge></div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {txSig && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm">
                <span className="text-green-400">Position created!</span>
                <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={() => setSignOpen(true)} disabled={!active || (!amountX && !amountY)}>
              Create Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignDialog
        open={signOpen}
        title="Create DLMM Position"
        description={`${STRATEGIES.find(s => s.type === strategy)?.label} strategy · ${numBins} bins · ${pair.name}`}
        onConfirm={handleCreate}
        onCancel={() => setSignOpen(false)}
      />
    </>
  );
}
