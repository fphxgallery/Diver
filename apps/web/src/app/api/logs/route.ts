import { NextResponse } from "next/server";
import { getLogs } from "@/lib/server/server-log";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getLogs());
}
