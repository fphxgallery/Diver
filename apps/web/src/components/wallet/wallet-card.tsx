"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Trash2, Radio } from "lucide-react";
import { useWalletStore } from "@/store/wallet-store";
import { useQuery } from "@tanstack/react-query";
import { getSolBalance } from "@/lib/solana/balance";
import type { StoredWallet } from "@diver/keypair-store";
import { cn } from "@/lib/utils";

interface Props {
  wallet: StoredWallet;
}

export function WalletCard({ wallet }: Props) {
  const { activeId, setActive, removeWallet } = useWalletStore();
  const isActive = activeId === wallet.id;
  const [copied, setCopied] = useState(false);

  const { data: balance } = useQuery({
    queryKey: ["balance", wallet.publicKey],
    queryFn: () => getSolBalance(wallet.publicKey),
    refetchInterval: 30_000,
  });

  const shortKey = `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}`;

  function copy() {
    navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className={cn(
      "p-4 bg-card border transition-all duration-200 cursor-pointer hover:border-primary/50",
      isActive ? "border-primary glow-purple" : "border-border"
    )} onClick={() => setActive(wallet.id)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
            isActive ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
          )}>
            {wallet.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{wallet.name}</span>
              {isActive && <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-0">Active</Badge>}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">{shortKey}</span>
              <button onClick={e => { e.stopPropagation(); copy(); }} className="text-muted-foreground hover:text-foreground">
                {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold">
            {balance !== undefined ? `${balance.toFixed(4)} SOL` : "—"}
          </div>
          <div className="flex items-center justify-end gap-1 mt-1">
            {!isActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={e => { e.stopPropagation(); setActive(wallet.id); }}
              >
                <Radio className="w-3 h-3 mr-1" /> Use
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={e => { e.stopPropagation(); removeWallet(wallet.id); }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
