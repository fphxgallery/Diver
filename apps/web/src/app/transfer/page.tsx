"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { TokenSelector, TokenLogo } from "@/components/swap/token-selector";
import { SignDialog } from "@/components/wallet/sign-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { SOL_TOKEN } from "@/store/token-store";
import { buildSolTransfer, buildSplTransfer, signAndSendTransaction } from "@/lib/solana/send";
import { getSolBalance } from "@/lib/solana/balance";
import { toRawAmount, type JupiterToken } from "@/lib/jupiter/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Send } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

function isValidAddress(addr: string): boolean {
  try { new PublicKey(addr); return true; } catch { return false; }
}

export default function TransferPage() {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);

  const [token, setToken] = useState<JupiterToken>(SOL_TOKEN);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState("");
  const [builtTx, setBuiltTx] = useState("");

  const { data: solBalance } = useQuery({
    queryKey: ["balance", active?.publicKey],
    queryFn: () => getSolBalance(active!.publicKey),
    enabled: !!active,
    refetchInterval: 30_000,
  });

  const recipientValid = recipient.length > 0 && isValidAddress(recipient);
  const amountValid = amount.length > 0 && parseFloat(amount) > 0;
  const canSend = !!active && recipientValid && amountValid;

  async function buildAndSign() {
    if (!active || !canSend) return;
    setError("");
    try {
      let txBase64: string;
      const raw = toRawAmount(amount, token.decimals);
      if (token.address === SOL_TOKEN.address) {
        txBase64 = await buildSolTransfer({ from: active.publicKey, to: recipient, lamports: raw, cluster: "mainnet-beta" });
      } else {
        txBase64 = await buildSplTransfer({ mint: token.address, from: active.publicKey, to: recipient, amount: raw, decimals: token.decimals, cluster: "mainnet-beta" });
      }
      setBuiltTx(txBase64);
      setSignOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    }
  }

  async function handleSend(password: string) {
    if (!active || !builtTx) throw new Error("No transaction");
    const sig = await signAndSendTransaction(builtTx, active, password);
    setTxSig(sig);
    setAmount("");
    setRecipient("");
    setBuiltTx("");
  }

  return (
    <>
      <WalletHydrator />
      <div className="p-6 flex justify-center">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold mb-2">Transfer</h1>

          <Card className="p-4 border-border bg-card space-y-4">
            {/* Token + amount */}
            <div>
              <Label className="mb-1.5 block">Token & Amount</Label>
              <div className="flex gap-2">
                <button onClick={() => setSelectorOpen(true)}
                  className="flex items-center gap-2 bg-secondary hover:bg-secondary/70 rounded-xl px-3 py-2 transition-colors shrink-0">
                  <TokenLogo token={token} />
                  <span className="font-semibold">{token.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                <div className="relative flex-1">
                  <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0"
                    className="bg-secondary border-border pr-14" />
                  {active && token.address === SOL_TOKEN.address && solBalance !== undefined && (
                    <button onClick={() => setAmount((solBalance - 0.005).toFixed(9))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:underline">
                      Max
                    </button>
                  )}
                </div>
              </div>
              {active && token.address === SOL_TOKEN.address && solBalance !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">Balance: {solBalance.toFixed(4)} SOL</p>
              )}
            </div>

            {/* Recipient */}
            <div>
              <Label className="mb-1.5 block">Recipient Address</Label>
              <Input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Solana wallet address"
                className={`bg-secondary font-mono text-sm ${recipient && !recipientValid ? "border-destructive" : "border-border"}`} />
              {recipient && !recipientValid && (
                <p className="text-destructive text-xs mt-1">Invalid Solana address</p>
              )}
              {/* Quick-fill own wallets */}
              {wallets.filter(w => w.id !== activeId).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground">Own wallets:</span>
                  {wallets.filter(w => w.id !== activeId).map(w => (
                    <button key={w.id} onClick={() => setRecipient(w.publicKey)}
                      className="text-xs text-primary hover:underline">
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {txSig && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm">
                <span className="text-green-400">Sent!</span>
                <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {!active ? (
              <Button disabled className="w-full">No wallet selected</Button>
            ) : (
              <Button className="w-full" disabled={!canSend} onClick={buildAndSign}>
                <Send className="w-4 h-4 mr-2" /> Send {token.symbol}
              </Button>
            )}
          </Card>
        </div>
      </div>

      <TokenSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={t => setToken(t)} />
      <SignDialog open={signOpen} title="Confirm Transfer"
        description={`Send ${amount} ${token.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`}
        onConfirm={handleSend} onCancel={() => setSignOpen(false)} />
    </>
  );
}
