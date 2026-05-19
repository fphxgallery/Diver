"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignDialog } from "@/components/wallet/sign-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useDlmmStore } from "@/store/dlmm-store";
import { buildRemoveLiquidity, buildClaimFees } from "@/lib/meteora/positions";
import { signAndSendTransaction } from "@/lib/solana/send";
import { cn } from "@/lib/utils";
import { Coins, Minus, ExternalLink, TrendingUp } from "lucide-react";
import Link from "next/link";
import BN from "bn.js";

interface UserPositionWithMeta {
  publicKey: string;
  lbPair: string;
  pairName: string;
  lowerBinId: number;
  upperBinId: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: string;
  feeY: string;
  inRange: boolean;
  activeBinId: number;
  tokenXDecimals: number;
  tokenYDecimals: number;
  tokenXSymbol: string;
  tokenYSymbol: string;
}

interface Props {
  position: UserPositionWithMeta;
  tokenXPrice?: number;
  tokenYPrice?: number;
}

type Action = "claim" | "remove" | null;

export function PositionCard({ position, tokenXPrice, tokenYPrice }: Props) {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  const invalidate = useDlmmStore(s => s.invalidatePositions);

  const [action, setAction] = useState<Action>(null);
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState("");

  const hasFees = new BN(position.feeX).gtn(0) || new BN(position.feeY).gtn(0);
  const rangeWidth = position.upperBinId - position.lowerBinId;
  const rangeProgress = !position.inRange ? 0 :
    ((position.activeBinId - position.lowerBinId) / rangeWidth) * 100;

  useEffect(() => {
    if (!txSig) return;
    const t = setTimeout(() => setTxSig(""), 10_000);
    return () => clearTimeout(t);
  }, [txSig]);

  async function handleAction(password: string) {
    if (!active) throw new Error("No wallet");
    setError("");
    const cluster = "mainnet-beta";
    try {
      let sigs: string[];
      if (action === "claim") {
        const tx = await buildClaimFees({ poolAddress: position.lbPair, positionKey: position.publicKey, wallet: active, password, cluster });
        sigs = [await signAndSendTransaction(tx, active, password)];
      } else {
        const txs = await buildRemoveLiquidity({ poolAddress: position.lbPair, positionKey: position.publicKey, wallet: active, password, cluster });
        sigs = [];
        for (const tx of txs) sigs.push(await signAndSendTransaction(tx, active, password));
      }
      setTxSig(sigs[sigs.length - 1]);
      invalidate(active.publicKey);
      setAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className={cn(
      "p-4 border transition-colors",
      position.inRange ? "border-green-500/30 bg-green-500/[0.03]" : "border-yellow-500/30 bg-yellow-500/[0.03]"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/dlmm/${position.lbPair}`} className="font-semibold hover:text-primary transition-colors">
              {position.pairName}
            </Link>
            <Badge className={cn("text-xs border-0", position.inRange ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400")}>
              {position.inRange ? "In Range" : "Out of Range"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">
            Bins {position.lowerBinId} — {position.upperBinId}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasFees && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-400 hover:bg-green-500/10" onClick={() => setAction("claim")}>
              <Coins className="w-3 h-3 mr-1" /> Claim
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10" onClick={() => setAction("remove")}>
            <Minus className="w-3 h-3 mr-1" /> Remove
          </Button>
        </div>
      </div>

      {/* Liquidity amounts */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs mb-0.5">{position.tokenXSymbol}</div>
          <div className="font-medium">{(parseFloat(position.totalXAmount) / Math.pow(10, position.tokenXDecimals)).toFixed(4)}</div>
          {tokenXPrice != null && (
            <div className="text-xs text-muted-foreground">${((parseFloat(position.totalXAmount) / Math.pow(10, position.tokenXDecimals)) * tokenXPrice).toFixed(2)}</div>
          )}
          {new BN(position.feeX).gtn(0) && (
            <div className="text-xs text-green-400">+{(parseFloat(position.feeX) / Math.pow(10, position.tokenXDecimals)).toFixed(6)} fees</div>
          )}
        </div>
        <div>
          <div className="text-muted-foreground text-xs mb-0.5">{position.tokenYSymbol}</div>
          <div className="font-medium">{(parseFloat(position.totalYAmount) / Math.pow(10, position.tokenYDecimals)).toFixed(4)}</div>
          {tokenYPrice != null && (
            <div className="text-xs text-muted-foreground">${((parseFloat(position.totalYAmount) / Math.pow(10, position.tokenYDecimals)) * tokenYPrice).toFixed(2)}</div>
          )}
          {new BN(position.feeY).gtn(0) && (
            <div className="text-xs text-green-400">+{(parseFloat(position.feeY) / Math.pow(10, position.tokenYDecimals)).toFixed(6)} fees</div>
          )}
        </div>
      </div>

      {/* Range progress bar */}
      {position.inRange && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{position.lowerBinId}</span>
            <span className="text-primary">Active: {position.activeBinId}</span>
            <span>{position.upperBinId}</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${rangeProgress}%` }} />
          </div>
        </div>
      )}

      {txSig && (
        <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-green-400 hover:underline mt-2">
          Done — View tx <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {error && <p className="text-destructive text-xs mt-2">{error}</p>}

      <SignDialog
        open={action !== null}
        title={action === "claim" ? "Claim Fees" : "Remove Liquidity"}
        description={action === "remove" ? "This will remove 100% of liquidity and close the position." : undefined}
        onConfirm={handleAction}
        onCancel={() => setAction(null)}
      />
    </Card>
  );
}
