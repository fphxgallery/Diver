"use client";

import { create } from "zustand";
import { getTokenList, type JupiterToken } from "@/lib/jupiter/api";

const SOL_TOKEN: JupiterToken = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  tags: ["verified"],
};

interface TokenState {
  tokens: JupiterToken[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  search: (query: string) => JupiterToken[];
  getByMint: (mint: string) => JupiterToken | undefined;
}

export const useTokenStore = create<TokenState>((set, get) => ({
  tokens: [SOL_TOKEN],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const list = await getTokenList();
      set({ tokens: [SOL_TOKEN, ...list.filter(t => t.address !== SOL_TOKEN.address)], loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  search: (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return get().tokens.slice(0, 50);
    return get().tokens.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase() === q
    ).slice(0, 50);
  },

  getByMint: (mint) => get().tokens.find(t => t.address === mint),
}));

export { SOL_TOKEN };
