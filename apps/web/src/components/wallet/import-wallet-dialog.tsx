"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { importFromMnemonic, importFromPrivateKeyBytes } from "@diver/keypair-store";
import { useWalletStore } from "@/store/wallet-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportWalletDialog({ open, onClose }: Props) {
  const addWallet = useWalletStore(s => s.addWallet);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setName(""); setPassword(""); setMnemonic(""); setPrivateKey(""); setError("");
    onClose();
  }

  async function importMnemonic() {
    if (!name.trim()) { setError("Name required"); return; }
    if (password.length < 8) { setError("Password 8+ characters"); return; }
    setLoading(true);
    try {
      const wallet = importFromMnemonic(name.trim(), mnemonic.trim(), password);
      addWallet(wallet);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function importKey() {
    if (!name.trim()) { setError("Name required"); return; }
    if (password.length < 8) { setError("Password 8+ characters"); return; }
    setLoading(true);
    try {
      const trimmed = privateKey.trim();
      let bytes: Uint8Array;
      if (trimmed.startsWith("[")) {
        bytes = new Uint8Array(JSON.parse(trimmed));
      } else {
        const { default: bs58 } = await import("bs58");
        bytes = bs58.decode(trimmed);
      }
      const wallet = importFromPrivateKeyBytes(name.trim(), bytes, password);
      addWallet(wallet);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Import Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Wallet Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Imported Wallet" className="bg-secondary border-border" />
          </div>
          <div className="space-y-1.5">
            <Label>Encryption Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" className="bg-secondary border-border" />
          </div>
          <Tabs defaultValue="mnemonic">
            <TabsList className="w-full bg-secondary">
              <TabsTrigger value="mnemonic" className="flex-1">Recovery Phrase</TabsTrigger>
              <TabsTrigger value="key" className="flex-1">Private Key</TabsTrigger>
            </TabsList>
            <TabsContent value="mnemonic" className="space-y-3 mt-3">
              <textarea
                value={mnemonic}
                onChange={e => setMnemonic(e.target.value)}
                placeholder="Enter your 12 or 24 word recovery phrase..."
                className="w-full h-24 bg-secondary border border-border rounded-md p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={importMnemonic} disabled={loading}>
                  {loading ? "Importing..." : "Import"}
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="key" className="space-y-3 mt-3">
              <textarea
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                placeholder="Base58 private key or [1,2,3,...] byte array"
                className="w-full h-20 bg-secondary border border-border rounded-md p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={importKey} disabled={loading}>
                  {loading ? "Importing..." : "Import"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
