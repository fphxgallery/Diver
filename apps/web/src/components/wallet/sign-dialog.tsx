"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

export function SignDialog({ open, title = "Confirm Transaction", description, onConfirm, onCancel }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!password) { setError("Password required"); return; }
    setLoading(true);
    setError("");
    try {
      await onConfirm(password);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setPassword("");
    setError("");
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleCancel(); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        {description && (
          <p className="text-sm text-muted-foreground -mt-1">{description}</p>
        )}
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Wallet Password</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="Enter your password to sign"
                className="bg-secondary border-border pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Signing..." : "Sign & Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
