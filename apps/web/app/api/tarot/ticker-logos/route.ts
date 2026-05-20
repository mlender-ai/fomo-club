import { NextResponse } from "next/server";
import { readTickerLogosConfig } from "@/lib/tarot/tickerLogosConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = readTickerLogosConfig();
  return NextResponse.json(config, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
  });
}
