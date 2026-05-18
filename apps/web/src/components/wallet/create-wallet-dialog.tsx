"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWallet } from "@diver/keypair-store";
import { useWalletStore } from "@/store/wallet-store";
import { Copy, Eye, EyeOff, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "form" | "mnemonic" | "confirm";

export function CreateWalletDialog({ open, onClose }: Props) {
  const addWallet = useWalletStore(s => s.addWallet);
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStep("form");
    setName("");
    setPassword("");
    setConfirmPassword("");
    setMnemonic("");
    setCopied(false);
    setError("");
    onClose();
  }

  function handleGenerate() {
    if (!name.trim()) { setError("Name required"); return; }
    if (password.length < 8) { setError("Password must be 8+ characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setError("");
    const { wallet, mnemonic: m } = createWallet(name.trim(), password);
    setMnemonic(m);
    addWallet(wallet);
    setStep("mnemonic");
  }

  function copyMnemonic() {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Create New Wallet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Wallet Name</Label>
                <Input
                  placeholder="My Wallet"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="8+ characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="bg-secondary border-border pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleGenerate}>Generate Wallet</Button>
            </DialogFooter>
          </>
        )}

        {step === "mnemonic" && (
          <>
            <DialogHeader>
              <DialogTitle>Save Your Recovery Phrase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Write down these 24 words in order. This is the only way to recover your wallet.
                Never share them with anyone.
              </p>
              <div className="bg-secondary rounded-lg p-4 relative">
                <div className="grid grid-cols-3 gap-2">
                  {mnemonic.split(" ").map((word, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs w-5 text-right">{i + 1}.</span>
                      <span className="text-sm font-mono">{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-destructive">
                ⚠ Store this phrase securely offline. It cannot be recovered if lost.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={reset} className="w-full">I've saved my phrase — Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
