import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/server/auth";
import { clearKey, clearAll } from "@/lib/server/key-store";
import { addLog } from "@/lib/server/server-log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { walletId } = await req.json().catch(() => ({}));

  if (walletId) {
    clearKey(walletId);
    addLog("info", "wallet.lock", `Wallet locked — ${walletId}`, { walletId });
  } else {
    clearAll();
    addLog("info", "wallet.lock", "All wallets locked");
  }

  return NextResponse.json({ ok: true });
}
