"use client";

import { create } from "zustand";
import { getTopPairs, searchPairs, type DlmmPair } from "@/lib/meteora/pools";
import { getUserPositions, isPositionInRange, type PositionInfo } from "@/lib/meteora/positions";

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

  loadPairs: () => Promise<void>;
  searchPairs: (query: string) => Promise<DlmmPair[]>;
  loadPositions: (walletPubkey: string, poolAddresses: string[], pairNames: Record<string, string>) => Promise<void>;
  getPositions: (walletPubkey: string) => UserPositionWithMeta[];
  invalidatePositions: (walletPubkey: string) => void;
}

export const useDlmmStore = create<DlmmState>((set, get) => ({
  pairs: [],
  pairsLoading: false,
  pairsLoaded: false,
  positions: {},
  positionsLoading: {},

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

  getPositions: (walletPubkey) => get().positions[walletPubkey] ?? [],

  invalidatePositions: (walletPubkey) => {
    set(s => {
      const next = { ...s.positions };
      delete next[walletPubkey];
      return { positions: next };
    });
  },
}));
