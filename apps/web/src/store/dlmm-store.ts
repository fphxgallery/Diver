"use client";

import { create } from "zustand";
import { getTopPairs, searchPairs, type DlmmPair } from "@/lib/meteora/pools";
import { getUserPositions, isPositionInRange, type PositionInfo } from "@/lib/meteora/positions";
import { getOpeningPositions } from "@/lib/meteora/lpagent";

// Module-level cache — survives re-renders, deduplicates concurrent calls
const discoveryInFlight = new Map<string, Promise<void>>();

interface UserPositionWithMeta extends PositionInfo {
  pairName: string;
  inRange: boolean;
  activeBinId: number;
}

interface DlmmState {
  pairs: DlmmPair[];
  pairsLoading: boolean;
  pairsLoaded: boolean;

  positions: Record<string, UserPositionWithMeta[]>; // keyed by walletPubkey
  positionsLoading: Record<string, boolean>;
  positionsLoaded: Record<string, boolean>;
  positionsLastFetchedAt: Record<string, number>;

  loadPairs: () => Promise<void>;
  searchPairs: (query: string) => Promise<DlmmPair[]>;
  loadPositions: (walletPubkey: string, poolAddresses: string[], pairNames: Record<string, string>) => Promise<void>;
  discoverAndLoadPositions: (walletPubkey: string, apiKey: string) => Promise<void>;
  getPositions: (walletPubkey: string) => UserPositionWithMeta[];
  invalidatePositions: (walletPubkey: string) => void;
}

export const useDlmmStore = create<DlmmState>((set, get) => ({
  pairs: [],
  pairsLoading: false,
  pairsLoaded: false,
  positions: {},
  positionsLoading: {},
  positionsLoaded: {},
  positionsLastFetchedAt: {},

  loadPairs: async () => {
    if (get().pairsLoaded || get().pairsLoading) return;
    set({ pairsLoading: true });
    try {
      const pairs = await getTopPairs(100);
      set({ pairs, pairsLoaded: true });
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
      await Promise.allSettled(
        poolAddresses.map(async (poolAddr) => {
          const { userPositions, activeBinId } = await getUserPositions(poolAddr, walletPubkey);
          userPositions.forEach(pos => {
            allPositions.push({
              ...pos,
              pairName: pairNames[poolAddr] ?? poolAddr.slice(0, 8),
              inRange: isPositionInRange(pos, activeBinId),
              activeBinId,
            });
          });
        })
      );
      set(s => ({ positions: { ...s.positions, [walletPubkey]: allPositions } }));
    } finally {
      set(s => ({ positionsLoading: { ...s.positionsLoading, [walletPubkey]: false } }));
    }
  },

  discoverAndLoadPositions: async (walletPubkey, apiKey) => {
    const lastFetch = get().positionsLastFetchedAt[walletPubkey] ?? 0;
    if (Date.now() - lastFetch < 60_000) return;

    // Return existing in-flight promise if one is already running
    const existing = discoveryInFlight.get(walletPubkey);
    if (existing) return existing;

    const promise = (async () => {
      set(s => ({ positionsLastFetchedAt: { ...s.positionsLastFetchedAt, [walletPubkey]: Date.now() } }));
      try {
        const lpPositions = await getOpeningPositions(walletPubkey, apiKey);
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

  invalidatePositions: (walletPubkey) => {
    set(s => {
      const positions = { ...s.positions };
      const positionsLoaded = { ...s.positionsLoaded };
      const positionsLastFetchedAt = { ...s.positionsLastFetchedAt };
      delete positions[walletPubkey];
      delete positionsLoaded[walletPubkey];
      delete positionsLastFetchedAt[walletPubkey];
      return { positions, positionsLoaded, positionsLastFetchedAt };
    });
  },
}));
