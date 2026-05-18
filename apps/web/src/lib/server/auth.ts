import { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function checkPin(req: NextRequest): { ok: true } | { ok: false; error: string } {
  const pin = process.env.DIVER_PIN;
  if (!pin) return { ok: true }; // No PIN configured — open (dev mode)

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token || !safeEqual(pin, token)) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true };
}
