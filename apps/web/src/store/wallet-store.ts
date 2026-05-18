"use client";

import { create } from "zustand";
import { WalletStore, type StoredWallet } from "@diver/keypair-store";

interface WalletState {
  wallets: StoredWallet[];
  activeId: string | null;
  hydrated: boolean;

  hydrate: () => void;
  addWallet: (wallet: StoredWallet) => void;
  removeWallet: (id: string) => void;
  setActive: (id: string) => void;
  getActive: () => StoredWallet | null;
  renameWallet: (id: string, name: string) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallets: [],
  activeId: null,
  hydrated: false,

  hydrate: () => {
    const wallets = WalletStore.getAll();
    const activeId = WalletStore.getActiveId();
    set({ wallets, activeId: activeId ?? wallets[0]?.id ?? null, hydrated: true });
  },

  addWallet: (wallet) => {
    WalletStore.save(wallet);
    const wallets = WalletStore.getAll();
    const activeId = get().activeId ?? wallet.id;
    if (!get().activeId) WalletStore.setActiveId(wallet.id);
    set({ wallets, activeId });
  },

  removeWallet: (id) => {
    WalletStore.remove(id);
    const wallets = WalletStore.getAll();
    const activeId = wallets[0]?.id ?? null;
    if (activeId) WalletStore.setActiveId(activeId);
    set({ wallets, activeId });
  },

  setActive: (id) => {
    WalletStore.setActiveId(id);
    set({ activeId: id });
  },

  getActive: () => {
    const { wallets, activeId } = get();
    return wallets.find(w => w.id === activeId) ?? null;
  },

  renameWallet: (id, name) => {
    const wallets = get().wallets.map(w => w.id === id ? { ...w, name } : w);
    wallets.forEach(w => { if (w.id === id) WalletStore.save(w); });
    set({ wallets });
  },
}));
