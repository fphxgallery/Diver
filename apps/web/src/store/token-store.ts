"use client";

import { create } from "zustand";
import { searchTokens, type JupiterToken } from "@/lib/jupiter/api";

const SOL_TOKEN: JupiterToken = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  tags: ["verified"],
};

// Small static list for empty-query state (avoids a no-query API call on open)
const DEFAULT_TOKENS: JupiterToken[] = [
  SOL_TOKEN,
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    tags: ["verified"],
  },
];

interface TokenState {
  // cache of tokens fetched during this session
  cache: Map<string, JupiterToken>;
  searching: boolean;
  searchResults: JupiterToken[];
  search: (query: string) => void;
  getByMint: (mint: string) => JupiterToken | undefined;
}

export const useTokenStore = create<TokenState>((set, get) => ({
  cache: new Map(DEFAULT_TOKENS.map(t => [t.address, t])),
  searching: false,
  searchResults: DEFAULT_TOKENS,

  search: async (query) => {
    const q = query.trim();
    if (!q) {
      set({ searchResults: DEFAULT_TOKENS, searching: false });
      return;
    }
    set({ searching: true });
    try {
      const results = await searchTokens(q);
      // merge into cache
      const cache = get().cache;
      for (const t of results) cache.set(t.address, t);
      set({ searchResults: results, cache: new Map(cache), searching: false });
    } catch {
      set({ searching: false });
    }
  },

  getByMint: (mint) => get().cache.get(mint),
}));

export { SOL_TOKEN };
