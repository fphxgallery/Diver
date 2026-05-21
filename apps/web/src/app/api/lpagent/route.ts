import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE_URL = "https://api.lpagent.io/open-api/v1";

/**
 * Server-side proxy for LP Agent API calls.
 * LP Agent blocks direct browser requests (CORS). All calls go through here.
 *
 * GET /api/lpagent?endpoint=<path>&<params>
 * Header: x-lp-api-key: <key>
 *
 * Supported endpoints:
 *   lp-positions/opening?owner=<pubkey>&protocol=meteora
 *   lp-positions/revenue/<owner>?period=day&range=7D&protocol=meteora
 *   token-balances?owner=<pubkey>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const endpoint = searchParams.get("endpoint");
  const apiKey = req.headers.get("x-lp-api-key") ?? "";

  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "Missing x-lp-api-key" }, { status: 400 });

  // Forward all query params except "endpoint" to LP Agent
  const forward = new URLSearchParams();
  searchParams.forEach((v, k) => { if (k !== "endpoint") forward.set(k, v); });
  const qs = forward.toString();
  const url = `${BASE_URL}/${endpoint}${qs ? `?${qs}` : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    const text = await upstream.text();
    try {
      const body = JSON.parse(text);
      return NextResponse.json(body, { status: upstream.status });
    } catch {
      console.error(`[diver] lpagent non-JSON response — status=${upstream.status} url=${url} body=${text.slice(0, 300)}`);
      return NextResponse.json({ error: `LP Agent returned non-JSON (${upstream.status})`, preview: text.slice(0, 200) }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[diver] lpagent proxy failed — url=${url} error=${msg}`);
    return NextResponse.json({ error: msg, url }, { status: 502 });
  }
}
