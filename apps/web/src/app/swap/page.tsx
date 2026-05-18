"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { TokenSelector, TokenLogo } from "@/components/swap/token-selector";
import { SignDialog } from "@/components/wallet/sign-dialog";
import { useWalletStore } from "@/store/wallet-store";
import { useTokenStore, SOL_TOKEN } from "@/store/token-store";
import {
  getQuote,
  getSwapTransaction,
  formatAmount,
  toRawAmount,
  priceImpactLabel,
  type JupiterToken,
  type QuoteResponse,
} from "@/lib/jupiter/api";
import { signAndSendTransaction } from "@/lib/solana/send";
import { getSolBalance } from "@/lib/solana/balance";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, ChevronDown, Settings2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const USDC: JupiterToken = {
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
};

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0];

export default function SwapPage() {
  const { wallets, activeId } = useWalletStore();
  const active = wallets.find(w => w.id === activeId);
  void useTokenStore(); // trigger hydration

  const [tokenIn, setTokenIn] = useState<JupiterToken>(SOL_TOKEN);
  const [tokenOut, setTokenOut] = useState<JupiterToken>(USDC);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippage, setShowSlippage] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState<"in" | "out" | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [txSig, setTxSig] = useState("");
  const [swapError, setSwapError] = useState("");

  const { data: solBalance } = useQuery({
    queryKey: ["balance", active?.publicKey],
    queryFn: () => getSolBalance(active!.publicKey),
    enabled: !!active,
    refetchInterval: 30_000,
  });

  const fetchQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !active) { setQuote(null); return; }
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const raw = toRawAmount(amountIn, tokenIn.decimals);
      const q = await getQuote({ inputMint: tokenIn.address, outputMint: tokenOut.address, amount: raw, slippageBps });
      setQuote(q);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Quote failed");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [amountIn, tokenIn, tokenOut, slippageBps, active]);

  useEffect(() => { const t = setTimeout(fetchQuote, 500); return () => clearTimeout(t); }, [fetchQuote]);

  function flipTokens() { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmountIn(""); setQuote(null); }

  async function handleSwap(password: string) {
    if (!quote || !active) throw new Error("No quote");
    const { swapTransaction } = await getSwapTransaction({ quoteResponse: quote, userPublicKey: active.publicKey });
    const sig = await signAndSendTransaction(swapTransaction, active, password);
    setTxSig(sig);
    setSignOpen(false);
    setAmountIn("");
    setQuote(null);
  }

  const impactLevel = quote ? priceImpactLabel(quote.priceImpactPct) : null;
  const canSwap = !!quote && !!active && !quoteLoading;

  return (
    <>
      <WalletHydrator />
      <div className="p-6 flex justify-center">
        <div className="w-full max-w-md space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold">Swap</h1>
            <button onClick={() => setShowSlippage(v => !v)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Settings2 className="w-4 h-4" /> {(slippageBps / 100).toFixed(2)}% slippage
            </button>
          </div>

          {showSlippage && (
            <Card className="p-3 border-border bg-card">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground mr-1">Slippage</span>
                {SLIPPAGE_OPTIONS.map(s => (
                  <button key={s} onClick={() => { setSlippageBps(s * 100); setCustomSlippage(""); }}
                    className={cn("px-3 py-1 rounded-md text-sm transition-colors", slippageBps === s * 100 ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                    {s}%
                  </button>
                ))}
                <Input value={customSlippage} onChange={e => { setCustomSlippage(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n) && n > 0 && n <= 50) setSlippageBps(Math.round(n * 100)); }}
                  placeholder="Custom" className="h-7 w-20 text-sm bg-secondary border-border" />
              </div>
            </Card>
          )}

          <Card className="p-4 border-border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">You pay</span>
              {active && tokenIn.address === SOL_TOKEN.address && solBalance !== undefined && (
                <button onClick={() => setAmountIn((solBalance - 0.005).toFixed(9))} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  Max: {solBalance.toFixed(4)} SOL
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Input value={amountIn} onChange={e => setAmountIn(e.target.value)} placeholder="0.00" type="number" min="0"
                className="flex-1 bg-transparent border-0 text-2xl font-semibold p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50" />
              <button onClick={() => setSelectorOpen("in")} className="flex items-center gap-2 bg-secondary hover:bg-secondary/70 rounded-xl px-3 py-2 transition-colors shrink-0">
                <TokenLogo token={tokenIn} />
                <span className="font-semibold">{tokenIn.symbol}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </Card>

          <div className="flex justify-center -my-1.5 relative z-10">
            <button onClick={flipTokens} className="w-9 h-9 rounded-xl bg-secondary border border-border flex items-center justify-center hover:bg-primary hover:border-primary hover:text-white transition-all">
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          <Card className="p-4 border-border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">You receive</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-semibold text-muted-foreground">
                {quoteLoading ? <div className="h-8 w-24 rounded bg-secondary animate-pulse" /> :
                  quote ? <span className="text-foreground">{formatAmount(quote.outAmount, tokenOut.decimals)}</span> : "0.00"}
              </div>
              <button onClick={() => setSelectorOpen("out")} className="flex items-center gap-2 bg-secondary hover:bg-secondary/70 rounded-xl px-3 py-2 transition-colors shrink-0">
                <TokenLogo token={tokenOut} />
                <span className="font-semibold">{tokenOut.symbol}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </Card>

          {quote && (
            <Card className="p-3 border-border bg-card text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price impact</span>
                <span className={cn(impactLevel === "low" ? "text-green-400" : impactLevel === "medium" ? "text-yellow-400" : "text-destructive")}>
                  {parseFloat(quote.priceImpactPct).toFixed(3)}%{impactLevel !== "low" && " ⚠"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min. received</span>
                <span>{formatAmount(quote.otherAmountThreshold, tokenOut.decimals)} {tokenOut.symbol}</span>
              </div>
            </Card>
          )}

          {quoteError && <p className="text-destructive text-sm text-center">{quoteError}</p>}

          {txSig && (
            <Card className="p-3 border-green-500/30 bg-green-500/5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-green-400">Swap successful!</span>
                <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </Card>
          )}
          {swapError && <p className="text-destructive text-sm text-center">{swapError}</p>}

          {!active ? (
            <Button disabled className="w-full">No wallet selected</Button>
          ) : (
            <Button className="w-full" disabled={!canSwap} onClick={() => setSignOpen(true)}>
              {quoteLoading ? "Getting quote..." : !amountIn ? "Enter amount" : !quote ? "Fetching route..." : "Swap"}
            </Button>
          )}
        </div>
      </div>

      <TokenSelector open={selectorOpen === "in"} onClose={() => setSelectorOpen(null)} onSelect={t => setTokenIn(t)} excluded={tokenOut.address} />
      <TokenSelector open={selectorOpen === "out"} onClose={() => setSelectorOpen(null)} onSelect={t => setTokenOut(t)} excluded={tokenIn.address} />
      <SignDialog open={signOpen} title="Confirm Swap"
        description={quote ? `Swap ${formatAmount(quote.inAmount, tokenIn.decimals)} ${tokenIn.symbol} → ${formatAmount(quote.outAmount, tokenOut.decimals)} ${tokenOut.symbol}` : undefined}
        onConfirm={handleSwap} onCancel={() => setSignOpen(false)} />
    </>
  );
}
