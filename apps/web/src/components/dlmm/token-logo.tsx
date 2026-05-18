"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getTokenLogoUri } from "@/lib/solana/token-logo";

interface Props {
  mint: string;
  symbol: string;
  size?: number;
  className?: string;
}

export function TokenLogo({ mint, symbol, size = 40, className }: Props) {
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    getTokenLogoUri(mint).then(setLogoUri);
  }, [mint]);

  const fallback = (
    <div
      style={{ width: size, height: size }}
      className={cn("rounded-full bg-secondary flex items-center justify-center font-bold text-sm text-muted-foreground", className)}
    >
      {symbol[0] ?? "?"}
    </div>
  );

  if (!logoUri || imgFailed) return fallback;

  return (
    <img
      src={logoUri}
      alt={symbol}
      width={size}
      height={size}
      className={cn("rounded-full object-cover", className)}
      onError={() => setImgFailed(true)}
    />
  );
}
