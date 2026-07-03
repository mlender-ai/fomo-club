import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { buildDaily30Response, type Daily30Response } from "../../../../lib/daily-30";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REVALIDATE_S = 60 * 60 * 12;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const load = unstable_cache(
      () => buildDaily30Response(),
      ["fomo-daily-30", cacheVersion(), kstDate()],
      { revalidate: REVALIDATE_S }
    );
    return withCors(
      NextResponse.json(await load(), {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[fomo/daily-30] failed", (err as Error)?.message);
    // 실패는 반드시 비200으로 — 200-빈덱을 성공으로 캐시/렌더하면 클라 재시도가 멈춘다(빈 덱 stuck).
    return withCors(
      NextResponse.json(
        {
          asOf: kstDate(),
          country: "all",
          stocks: [],
          cards: [],
          fronts: {},
          confidence: "L",
          source: "데이터 없음",
          meta: {
            targetCount: 30,
            cards: [],
            assetCounts: { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 },
          },
        } satisfies Daily30Response,
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
