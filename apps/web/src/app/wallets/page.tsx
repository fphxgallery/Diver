"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WalletCard } from "@/components/wallet/wallet-card";
import { CreateWalletDialog } from "@/components/wallet/create-wallet-dialog";
import { ImportWalletDialog } from "@/components/wallet/import-wallet-dialog";
import { WalletHydrator } from "@/components/wallet/wallet-hydrator";
import { useWalletStore } from "@/store/wallet-store";
import { Plus, Download } from "lucide-react";

export default function WalletsPage() {
  const { wallets, hydrated } = useWalletStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <WalletHydrator />
      <div className="pt-32 px-6 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Wallets</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="w-4 h-4 mr-1.5" /> Import
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> New Wallet
            </Button>
          </div>
        </div>

        {!hydrated ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg mb-2">No wallets yet</p>
            <p className="text-sm mb-6">Create a new wallet or import an existing one</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Download className="w-4 h-4 mr-1.5" /> Import
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Create Wallet
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map(wallet => (
              <WalletCard key={wallet.id} wallet={wallet} />
            ))}
          </div>
        )}
      </div>

      <CreateWalletDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportWalletDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
