"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTokenStore } from "@/store/token-store";
import type { JupiterToken } from "@/lib/jupiter/api";
import { Search } from "lucide-react";
import Image from "next/image";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (token: JupiterToken) => void;
  excluded?: string;
}

function TokenLogo({ token }: { token: JupiterToken }) {
  const [err, setErr] = useState(false);
  if (!token.logoURI || err) {
    return (
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
        {token.symbol[0]}
      </div>
    );
  }
  return (
    <Image
      src={token.logoURI}
      alt={token.symbol}
      width={32}
      height={32}
      className="rounded-full shrink-0"
      onError={() => setErr(true)}
      unoptimized
    />
  );
}

export function TokenSelector({ open, onClose, onSelect, excluded }: Props) {
  const { search, load, loading } = useTokenStore();
  const [query, setQuery] = useState("");
  const results = search(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Select Token</DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, symbol, or address"
              className="pl-9 bg-secondary border-border"
            />
          </div>
        </div>
        <ScrollArea className="h-[340px] px-2 pb-2">
          {loading && results.length <= 1 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading tokens...</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No tokens found</div>
          ) : (
            results
              .filter(t => t.address !== excluded)
              .map(token => (
                <button
                  key={token.address}
                  onClick={() => { onSelect(token); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
                >
                  <TokenLogo token={token} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{token.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{token.name}</div>
                  </div>
                </button>
              ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export { TokenLogo };
