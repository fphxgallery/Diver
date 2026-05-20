"use client";

import { create } from "zustand";
import { getTopPairs, searchPairs, getPair, type DlmmPair } from "@/lib/meteora/pools";
import { getUserPositions, isPositionInRange, type PositionInfo } from "@/lib/meteora/positions";
import { getOpeningPositions } from "@/lib/meteora/lpagent";

// Module-level cache — survives re-renders, deduplicates concurrent calls
const discoveryInFlight = new Map<string, Promise<void>>();

interface UserPositionWithMeta extends PositionInfo {
  pairName: string;
  inRange: boolean;
  activeBinId: number;
  tokenXDecimals: number;
  tokenYDecimals: number;
  tokenXSymbol: string;
  tokenYSymbol: string;
}

function parseSymbols(pairName: string): [string, string] {
  const parts = pairName.split("-");
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : ["X", "Y"];
}

interface DlmmState {
  pairs: DlmmPair[];
  pairsLoading: boolean;
  pairsLoaded: boolean;
  pairsLoadedAt: number | null;

  positions: Record<string, UserPositionWithMeta[]>; // keyed by walletPubkey
  positionsLoading: Record<string, boolean>;
  positionsLoaded: Record<string, boolean>;
  positionsLastFetchedAt: Record<string, number>;
  lpAgentPositions: Record<string, import("@/lib/meteora/lpagent").LpAgentPosition[]>;

  loadPairs: () => Promise<void>;
  reloadPairs: () => Promise<void>;
  searchPairs: (query: string) => Promise<DlmmPair[]>;
  loadPositions: (walletPubkey: string, poolAddresses: string[], pairNames: Record<string, string>) => Promise<void>;
  discoverAndLoadPositions: (walletPubkey: string, apiKey: string) => Promise<void>;
  getPositions: (walletPubkey: string) => UserPositionWithMeta[];
  getLpAgentPositions: (walletPubkey: string) => import("@/lib/meteora/lpagent").LpAgentPosition[];
  invalidatePositions: (walletPubkey: string) => void;
}

export const useDlmmStore = create<DlmmState>((set, get) => ({
  pairs: [],
  pairsLoading: false,
  pairsLoaded: false,
  pairsLoadedAt: null,
  positions: {},
  positionsLoading: {},
  positionsLoaded: {},
  positionsLastFetchedAt: {},
  lpAgentPositions: {},

  loadPairs: async () => {
    if (get().pairsLoaded || get().pairsLoading) return;
    set({ pairsLoading: true });
    try {
      const pairs = await getTopPairs(100);
      set({ pairs, pairsLoaded: true, pairsLoadedAt: Date.now() });
    } finally {
      set({ pairsLoading: false });
    }
  },

  reloadPairs: async () => {
    if (get().pairsLoading) return;
    set({ pairsLoading: true, pairsLoaded: false });
    try {
      const pairs = await getTopPairs(100);
      set({ pairs, pairsLoaded: true, pairsLoadedAt: Date.now() });
    } finally {
      set({ pairsLoading: false });
    }
  },

  searchPairs: async (query) => {
    if (!query.trim()) return get().pairs.slice(0, 50);
    return searchPairs(query);
  },

  loadPositions: async (walletPubkey, poolAddresses, pairNames) => {
    if (get().positionsLoading[walletPubkey]) return;
    set(s => ({ positionsLoading: { ...s.positionsLoading, [walletPubkey]: true } }));

    try {
      const allPositions: UserPositionWithMeta[] = [];
      for (let i = 0; i < poolAddresses.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 300));
        const poolAddr = poolAddresses[i];
        try {
          const { userPositions, activeBinId, tokenXDecimals, tokenYDecimals } = await getUserPositions(poolAddr, walletPubkey);
          const name = pairNames[poolAddr] ?? poolAddr.slice(0, 8);
          // Prefer authoritative on-chain X/Y symbols from the pool metadata;
          // LP Agent pairName is often a single token and parseSymbols falls back to "X"/"Y".
          let [tokenXSymbol, tokenYSymbol] = parseSymbols(name);
          const known = get().pairs.find(p => p.address === poolAddr);
          if (known) {
            tokenXSymbol = known.token_x.symbol;
            tokenYSymbol = known.token_y.symbol;
          } else {
            try {
              const pair = await getPair(poolAddr);
              tokenXSymbol = pair.token_x.symbol;
              tokenYSymbol = pair.token_y.symbol;
            } catch { /* keep parseSymbols fallback */ }
          }
          userPositions.forEach(pos => {
            allPositions.push({
              ...pos,
              pairName: name,
              inRange: isPositionInRange(pos, activeBinId),
              activeBinId,
              tokenXDecimals,
              tokenYDecimals,
              tokenXSymbol,
              tokenYSymbol,
            });
          });
        } catch {
          // skip failed pools — don't abort the whole load
        }
      }
      set(s => ({ positions: { ...s.positions, [walletPubkey]: allPositions } }));
    } finally {
      set(s => ({ positionsLoading: { ...s.positionsLoading, [walletPubkey]: false } }));
    }
  },

  discoverAndLoadPositions: async (walletPubkey, apiKey) => {
    const lastFetch = get().positionsLastFetchedAt[walletPubkey] ?? 0;
    if (Date.now() - lastFetch < 60_000) return;

    const existing = discoveryInFlight.get(walletPubkey);
    if (existing) return existing;

    const promise = (async () => {
      set(s => ({ positionsLastFetchedAt: { ...s.positionsLastFetchedAt, [walletPubkey]: Date.now() } }));
      try {
        const lpPositions = await getOpeningPositions(walletPubkey, apiKey);
        // Store LP Agent data so dashboard can read currentValue/yield24h without a second call
        set(s => ({ lpAgentPositions: { ...s.lpAgentPositions, [walletPubkey]: lpPositions } }));
        const poolAddresses = [...new Set(lpPositions.map(p => p.pool))];
        const pairNames = Object.fromEntries(lpPositions.map(p => [p.pool, p.pairName]));
        await get().loadPositions(walletPubkey, poolAddresses, pairNames);
        set(s => ({ positionsLoaded: { ...s.positionsLoaded, [walletPubkey]: true } }));
      } finally {
        discoveryInFlight.delete(walletPubkey);
      }
    })();

    discoveryInFlight.set(walletPubkey, promise);
    return promise;
  },

  getPositions: (walletPubkey) => get().positions[walletPubkey] ?? [],
  getLpAgentPositions: (walletPubkey) => get().lpAgentPositions[walletPubkey] ?? [],

  invalidatePositions: (walletPubkey) => {
    set(s => {
      const positions = { ...s.positions };
      const positionsLoaded = { ...s.positionsLoaded };
      const positionsLastFetchedAt = { ...s.positionsLastFetchedAt };
      const lpAgentPositions = { ...s.lpAgentPositions };
      delete positions[walletPubkey];
      delete positionsLoaded[walletPubkey];
      delete positionsLastFetchedAt[walletPubkey];
      delete lpAgentPositions[walletPubkey];
      return { positions, positionsLoaded, positionsLastFetchedAt, lpAgentPositions };
    });
  },
}));
