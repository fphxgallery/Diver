"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/wallet-store";

export function WalletHydrator() {
  const hydrate = useWalletStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return null;
}
