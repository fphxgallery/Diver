import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/server/auth";
import { getValueHistory } from "@/lib/server/value-history-store";

export const runtime = "nodejs";

/** GET /api/value-history?owner=<pubkey> — server-recorded portfolio value snapshots */
export async function GET(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "Missing owner" }, { status: 400 });

  const history = await getValueHistory(owner);
  return NextResponse.json({ history });
}
