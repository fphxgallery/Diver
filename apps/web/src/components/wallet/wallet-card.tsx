"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, CheckCircle2, Trash2, Radio, Download, Eye, EyeOff } from "lucide-react";
import { useWalletStore } from "@/store/wallet-store";
import { useQuery } from "@tanstack/react-query";
import { getSolBalance } from "@/lib/solana/balance";
import { decryptKeystore } from "@diver/keypair-store";
import type { StoredWallet } from "@diver/keypair-store";
import { cn } from "@/lib/utils";
import bs58 from "bs58";

interface Props {
  wallet: StoredWallet;
}

function ExportDialog({ wallet, open, onClose }: { wallet: StoredWallet; open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function reveal() {
    setError("");
    try {
      const secretKey = decryptKeystore(wallet.keystore, password);
      setPrivateKey(bs58.encode(secretKey));
    } catch {
      setError("Wrong password");
    }
  }

  function copy() {
    navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setPassword("");
    setPrivateKey("");
    setError("");
    setVisible(false);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" /> Export Private Key — {wallet.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="text-xs text-muted-foreground bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            ⚠ Never share your private key. Anyone with it has full control of your wallet.
          </div>
          {!privateKey ? (
            <>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && reveal()}
                placeholder="Wallet password"
                className="bg-secondary border-border"
                autoFocus
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Input
                  readOnly
                  value={visible ? privateKey : "•".repeat(privateKey.length)}
                  className="bg-secondary border-border font-mono text-xs pr-10"
                />
                <button
                  onClick={() => setVisible(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={copy}>
                {copied ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-400" /> Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          {!privateKey ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={reveal} disabled={!password}>Reveal</Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WalletCard({ wallet }: Props) {
  const { activeId, setActive, removeWallet } = useWalletStore();
  const isActive = activeId === wallet.id;
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); setExportOpen(true); }}
            >
              <Download className="w-3 h-3" />
            </Button>
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

      <ExportDialog wallet={wallet} open={exportOpen} onClose={() => setExportOpen(false)} />
    </Card>
  );
}
