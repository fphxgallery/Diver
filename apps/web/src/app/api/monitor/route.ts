import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/server/auth";
import { listUnlocked, updatePools, updateSettings } from "@/lib/server/key-store";
import { getState, triggerCheckNow } from "@/lib/server/monitor-job";
import type { MonitorSettings } from "@/lib/meteora/monitor";

export const runtime = "nodejs";

/** GET /api/monitor — returns server monitor state + unlocked wallets */
export async function GET(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  return NextResponse.json({
    ...getState(),
    unlocked: listUnlocked(),
  });
}

/** POST /api/monitor — actions: check_now | update_pools | update_settings */
export async function POST(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    action: string;
    walletId?: string;
    poolAddresses?: string[];
    pairNames?: Record<string, string>;
    settings?: MonitorSettings;
  };

  switch (body.action) {
    case "check_now":
      triggerCheckNow();
      return NextResponse.json({ ok: true });

    case "update_pools":
      if (body.walletId && body.poolAddresses) {
        updatePools(body.walletId, body.poolAddresses, body.pairNames ?? {});
      }
      return NextResponse.json({ ok: true });

    case "update_settings":
      if (body.walletId && body.settings) {
        updateSettings(body.walletId, body.settings);
      }
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
