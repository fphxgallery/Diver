import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import { checkPin } from "@/lib/server/auth";
import { setKey } from "@/lib/server/key-store";
import { addLog } from "@/lib/server/server-log";
import type { MonitorSettings } from "@/lib/meteora/monitor";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/meteora/monitor";

export const runtime = "nodejs";

interface UnlockBody {
  walletId: string;
  publicKey: string;
  /** Base64-encoded 32-byte seed (client decrypts, never sends password) */
  seedBase64: string;
  settings?: Partial<MonitorSettings>;
  poolAddresses?: string[];
  pairNames?: Record<string, string>;
  rpcUrl?: string;
}

export async function POST(req: NextRequest) {
  const auth = checkPin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  let body: UnlockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { walletId, publicKey, seedBase64, settings, poolAddresses = [], pairNames = {}, rpcUrl = "https://api.mainnet-beta.solana.com" } = body;

  if (!walletId || !publicKey || !seedBase64) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let keypair: Keypair;
  try {
    const seed = Buffer.from(seedBase64, "base64");
    if (seed.length !== 32) throw new Error("Seed must be 32 bytes");
    keypair = Keypair.fromSeed(seed);
    // Verify public key matches
    if (keypair.publicKey.toBase58() !== publicKey) {
      return NextResponse.json({ error: "Public key mismatch" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid seed" }, { status: 400 });
  }

  setKey(walletId, {
    keypair,
    publicKey,
    settings: { ...DEFAULT_MONITOR_SETTINGS, ...settings },
    poolAddresses,
    pairNames,
    rpcUrl,
  });

  addLog("info", "wallet.unlock", `Wallet unlocked — ${publicKey.slice(0, 8)}…${publicKey.slice(-4)}`, { walletId, publicKey: publicKey.slice(0, 8) });

  return NextResponse.json({ ok: true });
}
