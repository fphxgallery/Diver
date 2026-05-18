import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function checkPin(_req: NextRequest): { ok: true } | { ok: false; error: string } {
  return { ok: true };
}
