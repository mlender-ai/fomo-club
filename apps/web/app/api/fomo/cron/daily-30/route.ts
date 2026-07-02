import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import type { Daily30Response } from "../../../../../lib/daily-30";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const warmUrl = new URL("/api/fomo/daily-30", request.url);
    const upstream = await fetch(warmUrl, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`daily-30 warmup ${upstream.status}`);
    const response = (await upstream.json()) as Daily30Response;
    return withCors(
      NextResponse.json(
        {
          ok: true,
          asOf: response.asOf,
          date: kstDate(),
          cards: response.cards?.length ?? 0,
          stocks: response.stocks.length,
          assetCounts: response.meta.assetCounts,
          elapsedMs: Date.now() - startedAt,
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/daily-30] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (err as Error)?.message ?? "daily-30 failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
