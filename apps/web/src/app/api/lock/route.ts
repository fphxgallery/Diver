import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/server/auth";
import { clearKey, clearAll } from "@/lib/server/key-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { walletId } = await req.json().catch(() => ({}));

  if (walletId) {
    clearKey(walletId);
  } else {
    clearAll();
  }

  return NextResponse.json({ ok: true });
}
