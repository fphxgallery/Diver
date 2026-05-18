"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SignDialog } from "@/components/wallet/sign-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useMonitorStore } from "@/store/monitor-store";
import { executeRebalance, type RebalancePreview } from "@/lib/meteora/rebalance";
import { signAndSendTransaction } from "@/lib/solana/send";
import { StrategyType } from "@meteora-ag/dlmm";
import { ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  positionKey: string;
  poolAddress: string;
  pairName: string;
  lowerBinId: number;
  upperBinId: number;
}

const STRATEGY_LABELS: Record<number, string> = {
  [StrategyType.Spot]: "Spot",
  [StrategyType.Curve]: "Curve",
  [StrategyType.BidAsk]: "Bid-Ask",
};

const BIN_COUNTS = [10, 20, 40, 69];

export function RebalanceDialog({ open, onClose, positionKey, poolAddress, pairName, lowerBinId, upperBinId }: Props) {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const { settings } = useMonitorStore();

  const [strategyType, setStrategyType] = useState<StrategyType>(
    settings.defaultStrategyType ?? StrategyType.Spot
  );
  const [numBins, setNumBins] = useState(settings.defaultNumBins ?? 20);
  const [signOpen, setSignOpen] = useState(false);
  const [txSigs, setTxSigs] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function handleRebalance(password: string) {
    if (!active) throw new Error("No wallet");
    setError("");

    const txBase64s = await executeRebalance({
      poolAddress,
      positionKey,
      wallet: active,
      password,
      settings: { strategyType, numBins },
      cluster: "mainnet-beta",
    });

    const sigs: string[] = [];
    for (const txBase64 of txBase64s) {
      const sig = await signAndSendTransaction(txBase64, active, password);
      sigs.push(sig);
    }

    setTxSigs(sigs);
    setSignOpen(false);
  }

  function reset() {
    setTxSigs([]);
    setError("");
    onClose();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" /> Rebalance — {pairName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Current range */}
            <div className="bg-secondary rounded-xl p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span>Current range</span>
                <span>New range (estimated)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-yellow-400">{lowerBinId} → {upperBinId}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-green-400">Active ±{Math.floor(numBins / 2)} bins</span>
              </div>
            </div>

            {/* Strategy */}
            <div>
              <Label className="mb-2 block">Strategy</Label>
              <div className="grid grid-cols-3 gap-2">
                {([StrategyType.Spot, StrategyType.Curve, StrategyType.BidAsk] as StrategyType[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStrategyType(s)}
                    className={cn(
                      "p-2.5 rounded-xl border text-sm font-medium transition-all",
                      strategyType === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {STRATEGY_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Bin count */}
            <div>
              <Label className="mb-2 block">Bin Width</Label>
              <div className="flex gap-2">
                {BIN_COUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setNumBins(n)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-sm transition-colors",
                      numBins === n ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 space-y-1">
              <div className="flex items-start gap-1.5">
                <span className="text-yellow-400 mt-0.5">⚠</span>
                <span>Rebalance will: claim fees → remove all liquidity → re-add centered on active bin.</span>
              </div>
              <div>This uses the native <code className="text-primary">rebalance_liquidity</code> instruction (single atomic tx when possible).</div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {txSigs.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <p className="text-green-400 text-sm font-medium">Rebalanced successfully</p>
                {txSigs.map((sig, i) => (
                  <a key={sig} href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    Tx {i + 1} <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={() => setSignOpen(true)} disabled={!active || txSigs.length > 0}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {txSigs.length > 0 ? "Done" : "Rebalance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignDialog
        open={signOpen}
        title="Confirm Rebalance"
        description={`${STRATEGY_LABELS[strategyType]} · ${numBins} bins · ${pairName}`}
        onConfirm={handleRebalance}
        onCancel={() => setSignOpen(false)}
      />
    </>
  );
}
