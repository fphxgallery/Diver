import type { StoredWallet } from "./types";

const STORAGE_KEY = "diver:wallets";
const ACTIVE_KEY = "diver:activeWallet";

export class WalletStore {
  static getAll(): StoredWallet[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static save(wallet: StoredWallet): void {
    const wallets = this.getAll();
    const idx = wallets.findIndex(w => w.id === wallet.id);
    if (idx >= 0) wallets[idx] = wallet;
    else wallets.push(wallet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  }

  static remove(id: string): void {
    const wallets = this.getAll().filter(w => w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
    if (this.getActiveId() === id) {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  static getActiveId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  }

  static setActiveId(id: string): void {
    localStorage.setItem(ACTIVE_KEY, id);
  }

  static getActive(): StoredWallet | null {
    const id = this.getActiveId();
    if (!id) return null;
    return this.getAll().find(w => w.id === id) ?? null;
  }
}
